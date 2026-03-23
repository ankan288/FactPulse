"""
debate_verifier.py — Multi-agent adversarial verification.

Architecture:
  Agent A (Support) → builds the strongest case that the claim is TRUE
  Agent B (Oppose)  → builds the strongest case that the claim is FALSE
  Judge Agent       → weighs both arguments + raw evidence → final verdict

Only called for low-confidence claims (< DEBATE_CONFIDENCE_THRESHOLD).
Uses cascading fallback through available LLM providers.
Each call is wrapped in asyncio.wait_for(timeout=25s) to prevent hangs.
"""

import asyncio
import json
import logging
import os
import re
from typing import List, Dict, Optional, Tuple

import litellm

from utils.llm_retry import retry_on_rate_limit, RateLimitError

logger = logging.getLogger(__name__)

# Timeout (seconds) for LLM calls
LLM_TIMEOUT = 25.0


def _get_available_providers() -> List[Tuple[str, str, Optional[str]]]:
    """
    Get list of available LLM providers based on configured API keys.
    Returns list of tuples: (model, api_key, api_base)
    """
    providers = []

    # 1. NVIDIA NIM API (generous free tier)
    nvidia_key = os.getenv("NVIDIA_API_KEY")
    if nvidia_key:
        providers.append((
            "openai/meta/llama-3.1-70b-instruct",
            nvidia_key,
            "https://integrate.api.nvidia.com/v1"
        ))

    # 2. Groq (fast but limited)
    groq_key = os.getenv("GROQ_API_KEY")
    if groq_key:
        providers.append((
            "groq/llama-3.3-70b-versatile",
            groq_key,
            None
        ))

    # 3. Together.ai
    together_key = os.getenv("TOGETHER_API_KEY")
    if together_key:
        providers.append((
            "together_ai/meta-llama/Llama-3.3-70B-Instruct-Turbo",
            together_key,
            None
        ))

    # 4. Google Gemini
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
    max_tokens: int = 600
) -> Optional[str]:
    """Call a single LLM provider with retry logic."""
    @retry_on_rate_limit(max_attempts=2, base_delay=1.5)
    async def _make_request():
        return await litellm.acompletion(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            api_key=api_key,
            **({"api_base": api_base} if api_base else {}),
            temperature=0.2,
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


async def _call_with_fallback(prompt: str, max_tokens: int = 600) -> Optional[str]:
    """Try each provider in order until one succeeds."""
    providers = _get_available_providers()

    if not providers:
        logger.error("No LLM providers configured")
        return None

    for model, api_key, api_base in providers:
        raw = await _call_provider(model, api_key, api_base, prompt, max_tokens)
        if raw:
            return raw
        logger.warning(f"Provider {model} failed, trying next...")

    return None


# ── Internal agent helpers ──────────────────────────────────────────────────

async def _run_agent(role_prompt: str, claim_text: str, ev_block: str) -> tuple:
    """Run a single debate agent and return its raw text argument.
    Falls back to empty string on timeout or error.
    """
    prompt = f"""{role_prompt}

CLAIM: "{claim_text}"

EVIDENCE:
{ev_block}

Write a concise argument (2–4 sentences). Cite specific evidence by index [1],[2] etc.
Respond with ONLY valid JSON. You MUST include your reflection before the final argument:
{{
  "step_1_analyze": "<Briefly state how the evidence supports your assigned role>",
  "step_2_draft": "<Draft the argument internally>",
  "argument": "<Final polished argument (2-4 sentences)>",
  "key_indices": [<1-5>]
}}"""

    raw = await _call_with_fallback(prompt, max_tokens=600)

    if not raw:
        return "", []

    try:
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        parsed = json.loads(raw)
        return parsed.get("argument", ""), [int(x) for x in parsed.get("key_indices", []) if str(x).isdigit()]
    except (json.JSONDecodeError, Exception) as e:
        logger.error("Debate agent parsing error: %s", e)
        return "", []


async def _support_agent(claim_text: str, ev_block: str):
    """Agent A — argues the claim is TRUE using the evidence."""
    role = (
        "You are a fact-checker tasked with building the STRONGEST POSSIBLE CASE "
        "that the following claim is TRUE or PARTIALLY TRUE. "
        "Use only the numbered evidence provided. "
        "Do NOT fabricate information. If the evidence doesn't support it, say so honestly."
    )
    return await _run_agent(role, claim_text, ev_block)


async def _oppose_agent(claim_text: str, ev_block: str):
    """Agent B — argues the claim is FALSE or UNVERIFIABLE using the evidence."""
    role = (
        "You are a skeptical fact-checker tasked with building the STRONGEST POSSIBLE CASE "
        "that the following claim is FALSE, MISLEADING, or UNVERIFIABLE. "
        "Identify gaps, contradictions, or missing context in the evidence. "
        "Use only the numbered evidence provided. Do NOT fabricate information."
    )
    return await _run_agent(role, claim_text, ev_block)


# ── Main entry point ────────────────────────────────────────────────────────

async def debate_verify(claim: Dict, evidence: List[Dict]) -> Dict:
    """Run a full Support → Oppose → Judge debate for a single claim.

    Returns a result dict with the same shape as verify_claim(), plus an
    extra 'debate' key containing the Support/Oppose arguments and Judge reasoning.
    This allows the frontend to optionally display the full debate transcript.
    """
    cid = claim["id"]
    claim_text = claim["claim"]
    is_ambiguous = claim.get("ambiguous", False)
    is_temporal = claim.get("temporal", False)

    if not evidence:
        return {
            "claimId": cid, "claim": claim_text,
            "verdict": "UNVERIFIABLE", "confidence": 0,
            "reasoning": "No web evidence available for debate.",
            "citations": [], "conflicting": False, "ruleFlags": [],
            "ambiguous": is_ambiguous, "temporal": is_temporal,
            "debate": {"support": "", "oppose": "", "judge_reasoning": ""},
        }

    # Build evidence block (shared by all three agents)
    ev_block = ""
    for i, e in enumerate(evidence[:5], 1):
        ev_block += (
            f"\n[{i}] {e['title']}  (Trust: {e.get('trust_score', 50)}/100)\n"
            f"URL: {e['url']}\nSnippet: {e['snippet']}\n"
        )

    # ── Step 1: Support agent ────────────────────────────────────────────────
    logger.info("[debate] Running Support agent for claim %s", cid)
    support_arg, support_indices = await _support_agent(claim_text, ev_block)
    await asyncio.sleep(1.5)  # Spread API calls to avoid rate limiting

    # ── Step 2: Oppose agent ─────────────────────────────────────────────────
    logger.info("[debate] Running Oppose agent for claim %s", cid)
    oppose_arg, oppose_indices = await _oppose_agent(claim_text, ev_block)
    await asyncio.sleep(1.5)

    # ── Step 3: Judge agent ──────────────────────────────────────────────────
    logger.info("[debate] Running Judge agent for claim %s", cid)

    temporal_note = (
        "\n⚠️ TEMPORAL NOTE: This claim refers to a current state. "
        "Prioritise the most recent evidence. If freshness is uncertain, reflect that in confidence.\n"
        if is_temporal else ""
    )
    ambiguous_note = (
        "\n⚠️ AMBIGUITY NOTE: This claim is ambiguous. "
        "Acknowledge which interpretation you are verifying.\n"
        if is_ambiguous else ""
    )

    judge_prompt = f"""You are the final arbiter in a fact-checking debate. Two expert fact-checkers have reviewed the following claim using the same evidence.

CLAIM: "{claim_text}"
{temporal_note}{ambiguous_note}
EVIDENCE:
{ev_block}

SUPPORT ARGUMENT (claims the fact is TRUE):
"{support_arg or 'No argument provided.'}"

OPPOSITION ARGUMENT (claims the fact is FALSE/UNVERIFIABLE):
"{oppose_arg or 'No argument provided.'}"

Your task:
1. Weigh both arguments against the raw evidence
2. Assess the credibility (trust scores) of the cited sources
3. Identify which argument is better supported by the evidence
4. Deliver a final, definitive verdict

CRITICAL: Your verdict must be grounded in the evidence, not the persuasiveness of the arguments.

Respond with ONLY valid JSON (no markdown). You MUST include your reflection before the final verdict:
{{
  "step_1_weigh_arguments": "<Summarize which argument handles the evidence better>",
  "step_2_credibility_check": "<Assess the trust scores of the critical sources>",
  "step_3_self_correction": "<Challenge your instinct. If you favor one side, what is the best evidence against it?>",
  "verdict": "TRUE"|"FALSE"|"PARTIALLY_TRUE"|"UNVERIFIABLE",
  "confidence": <0-100>,
  "reasoning": "<Final 2-3 sentences explaining the verdict and why one argument won>",
  "key_indices": [<1-5>]
}}"""

    raw = await _call_with_fallback(judge_prompt, max_tokens=800)

    if not raw:
        logger.error("[debate] All providers failed for Judge for claim %s", cid)
        return {
            "claimId": cid, "claim": claim_text,
            "verdict": "UNVERIFIABLE", "confidence": 15,
            "reasoning": "Debate could not complete — all verification services are currently unavailable.",
            "citations": [{"title": e["title"], "url": e["url"], "snippet": e["snippet"][:200], "trustScore": e.get("trust_score", 50)} for e in evidence[:2]],
            "conflicting": False, "ruleFlags": [],
            "ambiguous": is_ambiguous, "temporal": is_temporal,
            "debate": {"support": support_arg, "oppose": oppose_arg, "judge_reasoning": ""},
        }

    try:
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        parsed = json.loads(raw)

        verdict = parsed.get("verdict", "UNVERIFIABLE")
        confidence = int(parsed.get("confidence", 50))
        reasoning = parsed.get("reasoning", "")
        key_idx = [int(x) for x in parsed.get("key_indices", [1, 2]) if str(x).isdigit()]

        # Apply post-debate caps for temporal/ambiguous claims
        if is_temporal and verdict in ("TRUE", "PARTIALLY_TRUE"):
            confidence = min(confidence, 70)
        if is_ambiguous and verdict == "TRUE":
            verdict = "PARTIALLY_TRUE"
            confidence = min(confidence, 65)

        # Build citations
        all_indices = list(dict.fromkeys(key_idx + support_indices + oppose_indices))
        citations = []
        for idx in all_indices[:4]:
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

        logger.info("[debate] Claim %s → verdict=%s confidence=%d", cid, verdict, confidence)

        return {
            "claimId": cid, "claim": claim_text,
            "verdict": verdict, "confidence": confidence,
            "reasoning": reasoning, "citations": citations,
            "conflicting": bool(support_arg and oppose_arg),
            "ruleFlags": [],
            "ambiguous": is_ambiguous, "temporal": is_temporal,
            "debate": {
                "support": support_arg,
                "oppose": oppose_arg,
                "judge_reasoning": reasoning,
            },
        }

    except (json.JSONDecodeError, Exception) as e:
        logger.error("[debate] Judge parsing failed for claim %s: %s", cid, e, exc_info=True)
        return {
            "claimId": cid, "claim": claim_text,
            "verdict": "UNVERIFIABLE", "confidence": 20,
            "reasoning": "Debate could not reach a conclusive verdict.",
            "citations": [{"title": e["title"], "url": e["url"], "snippet": e["snippet"][:200], "trustScore": e.get("trust_score", 50)} for e in evidence[:2]],
            "conflicting": False, "ruleFlags": [],
            "ambiguous": is_ambiguous, "temporal": is_temporal,
            "debate": {"support": support_arg, "oppose": oppose_arg, "judge_reasoning": ""},
        }
