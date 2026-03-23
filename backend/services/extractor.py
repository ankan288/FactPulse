import asyncio
import json
import logging
import os
import re
from typing import List, Dict

import litellm

logger = logging.getLogger(__name__)

# Timeout (seconds) for a single LLM call — prevents hanging the pipeline
LLM_TIMEOUT = 20.0

# Patterns that indicate a claim is time-sensitive / temporal
_TEMPORAL_PATTERNS = re.compile(
    r"\b(current(?:ly)?|now|today|this year|latest|recent(?:ly)?|present(?:ly)?|"
    r"as of|right now|at the moment|at present|still|no longer|former(?:ly)?|"
    r"ceo|president|prime minister|governor|chairman|lead(?:er|s)?|head of)\b",
    re.IGNORECASE,
)


def _is_temporal(claim: str) -> bool:
    """Return True if the claim references a time-sensitive or role-based fact."""
    return bool(_TEMPORAL_PATTERNS.search(claim))


async def extract_claims(text: str) -> List[Dict]:
    """Extract verifiable atomic claims from text using Gemini Flash (or Groq fallback).

    Each claim is tagged:
    - ambiguous: True if the claim is subjective or hard to verify definitively
    - temporal:  True if the claim references a current state, role, or time-sensitive fact
    """
    sample = text[:5000]

    prompt = f"""You are a professional fact-checker. Your task is to extract ALL verifiable claims from the text — even short, simple, or general ones.

IMPORTANT: Always extract claims. Never return an empty list unless the text is purely fictional, emotional, or a question with no factual assertion.

Extract every verifiable factual claim, including:
- Scientific or research-based claims: "Coffee improves memory", "Exercise reduces stress", "Vitamin C boosts immunity"
- Medical or health claims: "Drinking water improves digestion", "Sleep deprivation affects cognition"
- Statistical or numerical claims: "India has 1.4 billion people", "GDP grew by 3%"
- Historical claims: "India became independent in 1947"
- General knowledge claims: "The Earth orbits the Sun", "The sky is blue"
- Claims about people, roles, or events: "Elon Musk founded Tesla", "Obama was the 44th president"

EXCLUDE ONLY: pure opinions ("This is the best movie ever"), predictions about the future, and rhetorical questions.

Rules:
- Even a 3-word sentence can be a verifiable claim. Extract it.
- Mark "ambiguous": true if the claim has multiple interpretations or is hard to verify exactly
- Mark "temporal": true if the claim refers to a current state that may change — e.g. "The CEO is X", "Population is Y"
- Maximum 15 claims

Output ONLY a valid JSON array (no markdown fences, no explanation):
[{{"id": 1, "claim": "exact verifiable statement", "context": "surrounding sentence for context", "ambiguous": false, "temporal": false}}]

Text:
{sample}"""

    groq_key = os.getenv("GROQ_API_KEY")
    nvidia_key = os.getenv("NVIDIA_API_KEY")

    if groq_key:
        model = "groq/llama-3.3-70b-versatile"
        api_key = groq_key
        api_base = None
    elif nvidia_key:
        model = "openai/meta/llama-3.1-70b-instruct"
        api_key = nvidia_key
        api_base = "https://integrate.api.nvidia.com/v1"
    else:
        raise ValueError("No LLM API key configured. Set GROQ_API_KEY or NVIDIA_API_KEY.")

    loop = asyncio.get_event_loop()

    try:
        response = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                lambda: litellm.completion(
                    model=model,
                    messages=[{"role": "user", "content": prompt}],
                    api_key=api_key,
                    **({"api_base": api_base} if api_base else {}),
                    temperature=0.1,
                    max_tokens=2000,
                ),
            ),
            timeout=LLM_TIMEOUT,
        )
    except asyncio.TimeoutError:
        logger.error("extract_claims timed out after %.0fs — returning empty list", LLM_TIMEOUT)
        return []
    except Exception as e:
        logger.error("extract_claims LLM call failed: %s", e)
        return []

    raw = response.choices[0].message.content.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    try:
        claims = json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\[.*\]", raw, re.DOTALL)
        if match:
            claims = json.loads(match.group())
        else:
            logger.warning("extract_claims: could not parse LLM JSON output")
            return []

    valid = []
    for i, c in enumerate(claims[:15]):
        if isinstance(c, dict) and len(c.get("claim", "")) > 3:
            claim_text = c.get("claim", "")
            # Use LLM flag OR pattern-based fallback for temporal detection
            is_temporal = bool(c.get("temporal", False)) or _is_temporal(claim_text)
            valid.append({
                "id": i + 1,
                "claim": claim_text,
                "context": c.get("context", ""),
                "ambiguous": bool(c.get("ambiguous", False)),
                "temporal": is_temporal,
            })

    # ── Fallback: if LLM returned nothing, treat the whole input as a claim ──
    # This handles short, assertive statements like "coffee improves memory"
    # that a conservative LLM might fail to extract.
    if not valid and len(text.strip()) > 3:
        clean = text.strip().rstrip("?!")  # don't wrap pure questions
        is_question = text.strip().endswith("?") or text.strip().lower().startswith(("what", "who", "when", "where", "why", "how", "is ", "are ", "does ", "do ", "can ", "will "))
        if not is_question:
            logger.info("extract_claims: LLM returned empty — using full input as fallback claim")
            valid.append({
                "id": 1,
                "claim": clean,
                "context": clean,
                "ambiguous": True,
                "temporal": _is_temporal(clean),
            })

    return valid
