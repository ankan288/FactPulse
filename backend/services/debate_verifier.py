"""
debate_verifier.py — Multi-agent adversarial verification.

Architecture:
  Agent A (Support) → builds the strongest case that the claim is TRUE
  Agent B (Oppose)  → builds the strongest case that the claim is FALSE
  Judge Agent       → weighs both arguments + raw evidence → final verdict

Only called for low-confidence claims (< DEBATE_CONFIDENCE_THRESHOLD).
All three LLM calls reuse the same API key and model as the main verifier.
Each call is wrapped in asyncio.wait_for(timeout=20s) to prevent hangs.
"""

import asyncio
import json
import logging
import re
from typing import List, Dict

import litellm

from services.verifier import get_llm_config, LLM_TIMEOUT

logger = logging.getLogger(__name__)


# ── Internal agent helpers ──────────────────────────────────────────────────

async def _run_agent(role_prompt: str, claim_text: str, ev_block: str) -> str:
    """Run a single debate agent and return its raw text argument.
    Falls back to empty string on timeout or error.
    """
    model, api_key, api_base = get_llm_config()
    loop = asyncio.get_event_loop()

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

    try:
        resp = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                lambda: litellm.completion(
                    model=model,
                    messages=[{"role": "user", "content": prompt}],
                    api_key=api_key,
                    **(({"api_base": api_base}) if api_base else {}),
                    temperature=0.2,
                    max_tokens=600,
                ),
            ),
            timeout=LLM_TIMEOUT,
        )
        raw = resp.choices[0].message.content.strip()
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        parsed = json.loads(raw)
        return parsed.get("argument", ""), [int(x) for x in parsed.get("key_indices", []) if str(x).isdigit()]
    except asyncio.TimeoutError:
        logger.warning("Debate agent timed out.")
        return "", []
    except Exception as e:
        logger.error("Debate agent error: %s", e)
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
    await asyncio.sleep(0.5)   # Spread Groq API calls to avoid rate limiting

    # ── Step 2: Oppose agent ─────────────────────────────────────────────────
    logger.info("[debate] Running Oppose agent for claim %s", cid)
    oppose_arg, oppose_indices = await _oppose_agent(claim_text, ev_block)
    await asyncio.sleep(0.5)

    # ── Step 3: Judge agent ──────────────────────────────────────────────────
    logger.info("[debate] Running Judge agent for claim %s", cid)
    model, api_key, api_base = get_llm_config()
    loop = asyncio.get_event_loop()

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

    try:
        resp = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                lambda: litellm.completion(
                    model=model,
                    messages=[{"role": "user", "content": judge_prompt}],
                    api_key=api_key,
                    **(({"api_base": api_base}) if api_base else {}),
                    temperature=0.1,
                    max_tokens=800,
                ),
            ),
            timeout=LLM_TIMEOUT,
        )
        raw = resp.choices[0].message.content.strip()
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

    except asyncio.TimeoutError:
        logger.error("[debate] Judge timed out for claim %s", cid)
        return {
            "claimId": cid, "claim": claim_text,
            "verdict": "UNVERIFIABLE", "confidence": 15,
            "reasoning": "Debate judge timed out — the AI service did not respond in time.",
            "citations": [{"title": e["title"], "url": e["url"], "snippet": e["snippet"][:200], "trustScore": e.get("trust_score", 50)} for e in evidence[:2]],
            "conflicting": False, "ruleFlags": [],
            "ambiguous": is_ambiguous, "temporal": is_temporal,
            "debate": {"support": support_arg, "oppose": oppose_arg, "judge_reasoning": ""},
        }
    except (json.JSONDecodeError, Exception) as e:
        logger.error("[debate] Judge failed for claim %s: %s", cid, e)
        return {
            "claimId": cid, "claim": claim_text,
            "verdict": "UNVERIFIABLE", "confidence": 20,
            "reasoning": "Debate could not reach a conclusive verdict.",
            "citations": [{"title": e["title"], "url": e["url"], "snippet": e["snippet"][:200], "trustScore": e.get("trust_score", 50)} for e in evidence[:2]],
            "conflicting": False, "ruleFlags": [],
            "ambiguous": is_ambiguous, "temporal": is_temporal,
            "debate": {"support": support_arg, "oppose": oppose_arg, "judge_reasoning": ""},
        }

