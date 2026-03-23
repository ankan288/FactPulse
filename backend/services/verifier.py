import asyncio
import json
import logging
import os
import re
from typing import List, Dict, Optional, Tuple

import litellm

from utils.llm_retry import retry_on_rate_limit, RateLimitError

logger = logging.getLogger(__name__)

# Timeout (seconds) for a single LLM verification call
LLM_TIMEOUT = 25.0


def _get_available_providers() -> List[Tuple[str, str, Optional[str]]]:
    """
    Get list of available LLM providers based on configured API keys.
    Returns list of tuples: (model, api_key, api_base)
    Providers are ordered by preference (fastest/cheapest first).
    """
    providers = []

    # 1. NVIDIA NIM API (generous free tier - 1000 requests/day)
    nvidia_key = os.getenv("NVIDIA_API_KEY")
    if nvidia_key:
        providers.append((
            "openai/meta/llama-3.1-70b-instruct",
            nvidia_key,
            "https://integrate.api.nvidia.com/v1"
        ))

    # 2. Groq (fast but limited - 100k tokens/day on free tier)
    groq_key = os.getenv("GROQ_API_KEY")
    if groq_key:
        providers.append((
            "groq/llama-3.3-70b-versatile",
            groq_key,
            None
        ))

    # 3. Together.ai (good free tier option)
    together_key = os.getenv("TOGETHER_API_KEY")
    if together_key:
        providers.append((
            "together_ai/meta-llama/Llama-3.3-70B-Instruct-Turbo",
            together_key,
            None
        ))

    # 4. OpenRouter (aggregates many providers)
    openrouter_key = os.getenv("OPENROUTER_API_KEY")
    if openrouter_key:
        providers.append((
            "openrouter/meta-llama/llama-3.1-70b-instruct",
            openrouter_key,
            None
        ))

    # 5. Google Gemini (generous free tier)
    google_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if google_key:
        providers.append((
            "gemini/gemini-1.5-flash",
            google_key,
            None
        ))

    return providers


async def _call_provider(
    model: str,
    api_key: str,
    api_base: Optional[str],
    prompt: str,
    max_tokens: int = 800
) -> Optional[str]:
    """
    Call a single LLM provider with retry logic.
    Returns the response content or None if failed.
    """
    @retry_on_rate_limit(max_attempts=2, base_delay=1.5)
    async def _make_request():
        return await litellm.acompletion(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            api_key=api_key,
            **({"api_base": api_base} if api_base else {}),
            temperature=0.1,
            max_tokens=max_tokens,
        )

    try:
        response = await asyncio.wait_for(_make_request(), timeout=LLM_TIMEOUT)
        return response.choices[0].message.content.strip()
    except (asyncio.TimeoutError, RateLimitError) as e:
        logger.warning(f"Provider {model} failed: {e}")
        return None
    except Exception as e:
        logger.warning(f"Provider {model} error: {e}")
        return None


def _extract_numbers(text: str) -> List[float]:
    """Extract numeric values from text for rule-based checks."""
    nums = []
    for m in re.findall(r"\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\b|\b\d+(?:\.\d+)?\b", text):
        try:
            nums.append(float(m.replace(",", "")))
        except ValueError:
            pass
    return nums


def _rule_validate(claim: str, snippets: List[str]) -> Dict:
    """Layer 2: numeric and date consistency checks."""
    combined = " ".join(snippets)
    claim_nums = _extract_numbers(claim)
    ev_nums = _extract_numbers(combined)
    flags = []
    for cn in claim_nums:
        if cn > 1 and ev_nums:
            if not any(abs(en - cn) / max(abs(cn), 1) < 0.15 for en in ev_nums):
                flags.append(f"Numeric mismatch: '{cn}' not found in evidence")
    return {"flags": flags, "penalty": len(flags) > 0}


def _detect_conflict(evidence: List[Dict]) -> bool:
    """Layer 3: detect contradictory stances in evidence."""
    if len(evidence) < 2:
        return False
    pos = {"confirms", "true", "correct", "verified", "shows", "demonstrates", "supports"}
    neg = {"false", "incorrect", "wrong", "disputed", "denied", "debunked", "misleading", "contradicted"}
    has_pos = has_neg = False
    for item in evidence[:5]:
        s = item.get("snippet", "").lower()
        if any(w in s for w in pos):
            has_pos = True
        if any(w in s for w in neg):
            has_neg = True
    return has_pos and has_neg


def _conflict_strength(evidence: List[Dict]) -> int:
    """Return a 0–100 score for how strongly evidence sources conflict with each other.
    Used to cap confidence when there is genuine disagreement.
    """
    if len(evidence) < 2:
        return 0
    pos_count = neg_count = 0
    pos_kw = {"confirms", "true", "correct", "verified", "shows", "demonstrates", "supports", "proves"}
    neg_kw = {"false", "incorrect", "wrong", "disputed", "denied", "debunked", "misleading", "contradicted", "refutes"}
    for item in evidence[:5]:
        s = item.get("snippet", "").lower()
        if any(w in s for w in pos_kw):
            pos_count += 1
        if any(w in s for w in neg_kw):
            neg_count += 1
    total = pos_count + neg_count
    if total == 0:
        return 0
    # Conflict strength = how evenly split the stances are (0 = no conflict, 100 = perfectly split)
    minority = min(pos_count, neg_count)
    return int((minority / total) * 100)


async def verify_claim(claim: Dict, evidence: List[Dict]) -> Dict:
    """Hybrid 3-layer verification: LLM + Rule checks + Conflict detection.

    Uses cascading fallback: tries each configured provider until one succeeds.
    Handles three special cases with tailored prompt instructions:
    1. Conflicting sources       → instructs LLM to weigh source credibility
    2. Ambiguous claims          → instructs LLM to acknowledge interpretive uncertainty
    3. Temporally sensitive facts → warns LLM that evidence may be outdated; caps confidence
    """
    cid = claim["id"]
    claim_text = claim["claim"]
    is_ambiguous = claim.get("ambiguous", False)
    is_temporal = claim.get("temporal", False)

    if not evidence:
        logger.info("No evidence for claim %s — returning UNVERIFIABLE", cid)
        return {
            "claimId": cid, "claim": claim_text,
            "verdict": "UNVERIFIABLE", "confidence": 0,
            "reasoning": "No web evidence could be retrieved for this claim.",
            "citations": [], "conflicting": False, "ruleFlags": [],
            "ambiguous": is_ambiguous, "temporal": is_temporal,
        }

    # Layer 2 & 3
    snippets = [e.get("snippet", "") for e in evidence]
    rule = _rule_validate(claim_text, snippets)
    is_conflicting = _detect_conflict(evidence)
    conflict_score = _conflict_strength(evidence)

    # Build evidence block for prompt
    ev_block = ""
    for i, e in enumerate(evidence[:5], 1):
        ev_block += (
            f"\n[{i}] {e['title']}  (Trust: {e.get('trust_score', 50)}/100, "
            f"Source: {e.get('source', 'web')})\n"
            f"URL: {e['url']}\nSnippet: {e['snippet']}\n"
        )

    # ── Build context-aware instructions ────────────────────────────────────
    special_instructions = ""

    if is_temporal:
        special_instructions += (
            "\n⚠️ TEMPORAL CLAIM: This claim refers to a current state (e.g. 'The CEO is...'). "
            "IMPORTANT: The evidence may be outdated. Prioritise the most recently published sources. "
            "If no recent evidence is available, return 'UNVERIFIABLE' with a note about data freshness.\n"
        )

    if is_ambiguous:
        special_instructions += (
            "\n⚠️ AMBIGUOUS CLAIM: This claim may have multiple valid interpretations. "
            "Acknowledge this ambiguity in your reasoning. "
            "If the evidence only supports one interpretation, note which interpretation is verified.\n"
        )

    if is_conflicting:
        special_instructions += (
            "\n⚠️ CONFLICTING SOURCES: The evidence sources disagree with each other. "
            "Evaluate the CREDIBILITY of each source (trust scores provided). "
            "Weight higher-trust sources more heavily. "
            "If sources are equally credible but disagree, return 'PARTIALLY_TRUE' or 'UNVERIFIABLE'.\n"
        )

    if rule["flags"]:
        special_instructions += f"\nAUTO-CHECK (numeric): {'; '.join(rule['flags'])}\n"

    prompt = f"""You are a precise fact-checker. Evaluate the claim below using ONLY the evidence provided.

CLAIM: "{claim_text}"
{special_instructions}
EVIDENCE (ranked by credibility):
{ev_block}

Think step by step:
1. What does each piece of evidence say about the claim?
2. Are the sources recent and credible (check trust scores)?
3. Do the sources agree, partially agree, or contradict each other?
4. Does the evidence support, refute, or not address the claim?

CRITICAL: Base the verdict solely on the evidence. Do NOT use prior knowledge.

Respond with ONLY valid JSON (no markdown). You MUST include the reflection steps before the final verdict:
{{
  "step_1_evidence_analysis": "<Briefly state what the sources actually say>",
  "step_2_conflict_check": "<Identify any disagreements between sources>",
  "step_3_self_correction": "<Challenge your initial assumption. E.g. 'This looks true, BUT source [2] implies...'>",
  "verdict": "TRUE"|"FALSE"|"PARTIALLY_TRUE"|"UNVERIFIABLE",
  "confidence": <0-100>,
  "reasoning": "<Final synthesized paragraph for the user>",
  "key_indices": [<1-5>]
}}"""

    providers = _get_available_providers()

    if not providers:
        raise ValueError(
            "No LLM API key configured. Set one of: NVIDIA_API_KEY, GROQ_API_KEY, "
            "TOGETHER_API_KEY, OPENROUTER_API_KEY, or GOOGLE_API_KEY"
        )

    # Try each provider in order until one succeeds
    raw = None
    for model, api_key, api_base in providers:
        logger.info(f"Trying LLM provider for verification: {model}")
        raw = await _call_provider(model, api_key, api_base, prompt, max_tokens=800)
        if raw:
            logger.info(f"Success with provider: {model}")
            break
        logger.warning(f"Provider {model} failed, trying next...")

    if not raw:
        logger.error("All LLM providers failed for verify_claim %s", cid)
        return {
            "claimId": cid, "claim": claim_text,
            "verdict": "UNVERIFIABLE", "confidence": 10,
            "reasoning": "All verification services are currently unavailable. Please try again later.",
            "citations": [{"title": e["title"], "url": e["url"], "snippet": e["snippet"][:200], "trustScore": e.get("trust_score", 50)} for e in evidence[:2]],
            "conflicting": is_conflicting, "ruleFlags": rule["flags"],
            "ambiguous": is_ambiguous, "temporal": is_temporal,
        }

    try:
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        parsed = json.loads(raw)

        verdict = parsed.get("verdict", "UNVERIFIABLE")
        confidence = int(parsed.get("confidence", 50))
        reasoning = parsed.get("reasoning", "")
        key_idx = [int(x) for x in parsed.get("key_indices", [1, 2]) if str(x).isdigit()]

        # ── Apply penalties & caps ───────────────────────────────────────────
        if rule["penalty"]:
            confidence = max(0, confidence - 20)

        if is_conflicting and verdict == "TRUE":
            verdict = "PARTIALLY_TRUE"
            # Cap confidence in proportion to conflict strength
            max_conf = max(40, 75 - conflict_score // 4)
            confidence = min(confidence, max_conf)

        if is_temporal and verdict in ("TRUE", "PARTIALLY_TRUE"):
            # Time-sensitive claims should never be fully confident without fresh evidence
            confidence = min(confidence, 70)

        if is_ambiguous and verdict == "TRUE":
            # Genuinely ambiguous claims can't be fully TRUE
            verdict = "PARTIALLY_TRUE"
            confidence = min(confidence, 65)

        # ── Build citations ──────────────────────────────────────────────────
        citations = []
        for idx in key_idx:
            if 1 <= idx <= len(evidence):
                e = evidence[idx - 1]
                citations.append({
                    "title": e["title"], "url": e["url"],
                    "snippet": e["snippet"][:200],
                    "trustScore": e.get("trust_score", 50),
                })
        if not citations:
            for e in evidence[:2]:
                citations.append({
                    "title": e["title"], "url": e["url"],
                    "snippet": e["snippet"][:200],
                    "trustScore": e.get("trust_score", 50),
                })

        return {
            "claimId": cid, "claim": claim_text,
            "verdict": verdict, "confidence": confidence,
            "reasoning": reasoning, "citations": citations,
            "conflicting": is_conflicting, "ruleFlags": rule["flags"],
            "ambiguous": is_ambiguous, "temporal": is_temporal,
        }

    except (json.JSONDecodeError, Exception) as e:
        logger.error("verify_claim failed to parse response for claim %s: %s", cid, e, exc_info=True)
        return {
            "claimId": cid, "claim": claim_text,
            "verdict": "UNVERIFIABLE", "confidence": 20,
            "reasoning": "Verification response could not be parsed.",
            "citations": [{"title": e["title"], "url": e["url"], "snippet": e["snippet"][:200], "trustScore": e.get("trust_score", 50)} for e in evidence[:2]],
            "conflicting": is_conflicting, "ruleFlags": rule["flags"],
            "ambiguous": is_ambiguous, "temporal": is_temporal,
        }
