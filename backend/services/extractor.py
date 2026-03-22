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

    prompt = f"""You are a professional fact-checker. Extract every discrete, atomic, verifiable factual statement from the text below.

Rules:
- INCLUDE: specific facts, statistics, dates, names, locations, numerical data
- EXCLUDE: opinions, predictions, rhetorical questions, subjective assessments
- Mark "ambiguous": true if the claim could have multiple interpretations or is difficult to verify exactly
- Mark "temporal": true if the claim refers to a CURRENT state that may change over time — e.g. "The CEO is X", "The population is Y", "Country Z currently has..."
- Each claim must be independently verifiable
- Maximum 15 claims

Output ONLY a valid JSON array (no markdown fences, no explanation):
[{{"id": 1, "claim": "exact verifiable statement", "context": "surrounding sentence for context", "ambiguous": false, "temporal": false}}]

Text:
{sample}"""

    gemini_key = os.getenv("GEMINI_API_KEY")
    groq_key = os.getenv("GROQ_API_KEY")

    if gemini_key:
        model = "gemini/gemini-1.5-flash-latest"
        api_key = gemini_key
    elif groq_key:
        model = "groq/llama-3.3-70b-versatile"
        api_key = groq_key
    else:
        raise ValueError("Neither GEMINI_API_KEY nor GROQ_API_KEY is configured.")

    loop = asyncio.get_event_loop()

    try:
        response = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                lambda: litellm.completion(
                    model=model,
                    messages=[{"role": "user", "content": prompt}],
                    api_key=api_key,
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
        if isinstance(c, dict) and len(c.get("claim", "")) > 10:
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
    return valid
