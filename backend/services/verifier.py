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
    """Get list of available LLM providers based on configured API keys.

    Cascading Provider Strategy:
    This function checks multiple free/affordable LLM APIs in priority order.
    If one provider is rate-limited or fails, the system automatically falls back
    to the next provider, ensuring high availability and reliability.

    Provider Priority (by speed + cost):
    1. NVIDIA NIM API (Llama 3.1 70B) - Fastest, generous free tier
    2. Groq (Llama 3.3 70B) - Very fast, rate-limited
    3. Together.ai (Llama 3.3 70B) - Good free tier
    4. OpenRouter (Llama 3.1 70B) - Aggregates many models
    5. Google Gemini (Gemini 1.5 Flash) - Reliable fallback

    Returns:
    - List of (model_name, api_key, api_base) tuples
    - Empty list if no providers configured
    - Multiple providers ensure robustness (one failure doesn't break verification)

    Environment Variables:
    - NVIDIA_API_KEY: https://build.nvidia.com
    - GROQ_API_KEY: https://console.groq.com
    - TOGETHER_API_KEY: https://together.ai
    - OPENROUTER_API_KEY: https://openrouter.ai
    - GOOGLE_API_KEY or GEMINI_API_KEY: https://makersuite.google.com
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
    """Layer 2: Numeric and date consistency checks via rule-based verification.

    This layer catches numeric mismatches that the LLM might miss. Examples:
    - Claim: "The event happened in 2005" but all evidence says "2003"
    - Claim: "Population is 50 million" but evidence says "5 million"

    Algorithm:
    1. Extract all numbers from claim and evidence
    2. For each claim number, find a match in evidence (±15% tolerance)
    3. If no match found, flag as mismatch

    Returns:
    - flags: List of mismatch descriptions (e.g., ["Numeric mismatch: '2005' not found in evidence"])
    - penalty: Boolean indicating if any mismatches exist (reduces confidence by 20 points)

    Tolerance: ±15% allows for rounding differences (e.g., 1000 vs 1023 is acceptable as ~2% diff)
    """
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
    """Layer 3: Contradiction detection between sources.

    Analyzes the sentiment/certainty of evidence snippets to detect conflicting stances.
    This is a lightweight version of conflict detection—LLM does deeper analysis.

    Positive keywords: "confirms", "true", "correct", "verified", "proves"
    Negative keywords: "false", "incorrect", "wrong", "disputed", "debunked", "contradicted"

    Algorithm:
    1. Search snippets for positive and negative keywords
    2. If both found in the evidence set, mark as conflicting
    3. Return True if conflict detected across sources

    Example:
    - Evidence [0]: "Study confirms the claim is TRUE"
    - Evidence [1]: "Debunked research shows the claim is FALSE"
    - Result: Conflict detected → LLM must weigh source credibility

    Returns: Boolean indicating if conflicting stances exist
    """
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
    """Quantify conflict strength between evidence sources.

    Returns a 0–100 score indicating how strongly evidence sources conflict:
    - 0: No conflict (all sources agree)
    - 25-50: Weak conflict (one source disagrees, others agree)
    - 50-100: Strong conflict (sources are split)

    Algorithm:
    1. Count positive-stance sources (confirms, proves, supports)
    2. Count negative-stance sources (refutes, debunks, contradicts)
    3. Calculate split: minority_count / total_count * 100

    Example:
    - 3 sources say TRUE, 2 say FALSE → minority=2, total=5 → 40% conflict strength
    - Used to cap confidence: if TRUE verdict but 40% conflict, confidence capped at ~70%

    This prevents false confidence when genuine disagreement exists in sources.

    Returns: Integer 0-100 representing conflict strength
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

    Verification Process:
    --------------------
    Layer 1 (LLM): Chain-of-thought reasoning with self-verification
      - Few-shot examples show the LLM how to evaluate complex scenarios
      - Step-by-step reasoning: evidence analysis → conflict detection → self-correction
      - Explicit instruction to challenge initial assumptions
      - Returns: verdict + confidence + structured reasoning

    Layer 2 (Rules): Numeric and temporal consistency checks
      - Extracts numbers from claim and evidence
      - Flags mismatches (e.g., "2005" in claim but "2003" in evidence)
      - Numeric tolerance: ±15% for approximate matches

    Layer 3 (Conflict): Contradiction detection between sources
      - Analyzes sentiment/certainty keywords in evidence snippets
      - Detects when sources agree vs. disagree on the claim
      - Calculates conflict strength (0=none, 100=perfectly split)
      - Returns information about conflicting stances

    Final Adjustments:
    - Rule violations → Confidence penalty (-20 points)
    - High conflict + TRUE verdict → Downgrade to PARTIALLY_TRUE, cap confidence
    - Temporal claim → Cap confidence at 70% (data may be outdated)
    - Ambiguous claim + TRUE verdict → Downgrade to PARTIALLY_TRUE, cap at 65%
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

    # Layer 2 & 3: Rule validation & conflict detection
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

    # ── FEW-SHOT EXAMPLES (improves reasoning quality) ────────────────────
    fewshot_examples = """
## Example 1: Simple Factual Claim
CLAIM: "Mount Everest is the tallest mountain in the world"
EVIDENCE: [Mount Everest at 8,849m | K2 at 8,611m | Kangchenjunga at 8,586m]
REASONING:
  step_1: "All sources confirm Everest is tallest"
  step_2: "No conflicts—all sources agree"
  step_3: "This is well-established—verdict is TRUE with high confidence"
VERDICT: TRUE (95% confidence)
KEY SOURCES: [1, 2]

## Example 2: Claim with Conflicting Evidence
CLAIM: "Climate change is primarily caused by human activity"
EVIDENCE: [Climate report says 97% scientist consensus on human-caused | Oil industry source says natural cycles | EPA report says human activity dominant factor]
REASONING:
  step_1: "Source [1] and [3] agree (human-caused), source [2] attributes to natural cycles"
  step_2: "CONFLICT DETECTED: [1,3] vs [2]; but [1,3] are higher trust (EPA, scientific consensus)"
  step_3: "Self-check: Am I dismissing source [2] too quickly? No—oil industry source is less credible; scientific consensus is stronger"
VERDICT: TRUE (75% confidence, not 95% due to minority dissent)
KEY SOURCES: [1, 3]

## Example 3: Ambiguous/Temporal Claim
CLAIM: "The CEO of Apple is Tim Cook"
EVIDENCE: [Tim Cook became CEO in 2011 | Tim Cook leads Apple in 2024 | News: Apple CEO is Tim Cook]
REASONING:
  step_1: "All evidence confirms Tim Cook is the current CEO (temporal: recent sources matter)"
  step_2: "No conflicts; sources are current"
  step_3: "Self-check: Could this change soon? Possible but no evidence of transition—based on current evidence, verdict is TRUE"
VERDICT: TRUE (85% confidence—temporal claims capped due to potential change)
KEY SOURCES: [2, 3]
"""

    prompt = f"""You are a precise fact-checker using Chain-of-Thought reasoning with self-verification.

## INSTRUCTIONS:
Evaluate the claim ONLY using the provided evidence. Follow this explicit reasoning process:

1. **Evidence Analysis**: Describe what each source says about the claim
2. **Conflict Detection**: Identify any disagreements between sources
3. **Self-Verification**: Challenge your initial assumption. Ask yourself:
   - "Am I relying too heavily on one source?"
   - "Could there be an alternative interpretation?"
   - "Is the evidence strong enough, or just partially supporting?"
4. **Final Verdict**: Make a decision based on all three checks

{fewshot_examples}

## YOUR TASK:
CLAIM: "{claim_text}"
{special_instructions}
EVIDENCE (ranked by credibility):
{ev_block}

CRITICAL RULES:
- Base your verdict SOLELY on the evidence. Do NOT use prior knowledge.
- If evidence is contradictory, weight credibility (higher trust scores matter more).
- If evidence is insufficient, return UNVERIFIABLE.
- Be honest about confidence levels—don't overstate certainty.

Respond with ONLY valid JSON (no markdown, no code fences):
{{
  "step_1_evidence_analysis": "<Describe what each source says. Be specific>",
  "step_2_conflict_detection": "<Explicitly identify any disagreements or unified stances>",
  "step_3_self_verification": "<Challenge your reasoning. E.g., 'I initially thought X, BUT [source 2] suggests Y. After weighing credibility, X is stronger because...' or 'No flaws in reasoning detected.'>",
  "step_4_confidence_reasoning": "<Explain your confidence level: Is evidence strong/weak/mixed? Are sources recent/credible?>",
  "verdict": "TRUE"|"FALSE"|"PARTIALLY_TRUE"|"UNVERIFIABLE",
  "confidence": <0-100>,
  "reasoning": "<For user: synthesized explanation of the verdict in 2-3 sentences>",
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
        raw = await _call_provider(model, api_key, api_base, prompt, max_tokens=1000)
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
