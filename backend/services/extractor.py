import json
import os
import re
from typing import List, Dict

import litellm


async def extract_claims(text: str) -> List[Dict]:
    """Extract verifiable atomic claims from text using Gemini Flash."""
    sample = text[:5000]

    prompt = f"""You are a professional fact-checker. Extract every discrete, atomic, verifiable factual statement from the text below.

Rules:
- INCLUDE: specific facts, statistics, dates, names, locations, numerical data
- EXCLUDE: opinions, predictions, rhetorical questions, subjective assessments
- If a claim is ambiguous or time-sensitive, include it with "ambiguous": true
- Each claim must be independently verifiable
- Maximum 15 claims

Output ONLY a valid JSON array (no markdown fences, no explanation):
[{{"id": 1, "claim": "exact verifiable statement", "context": "surrounding sentence for context", "ambiguous": false}}]

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

    response = litellm.completion(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        api_key=api_key,
        temperature=0.1,
        max_tokens=2000,
    )

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
            return []

    valid = []
    for i, c in enumerate(claims[:15]):
        if isinstance(c, dict) and len(c.get("claim", "")) > 10:
            valid.append({
                "id": i + 1,
                "claim": c.get("claim", ""),
                "context": c.get("context", ""),
                "ambiguous": bool(c.get("ambiguous", False)),
            })
    return valid
