import json
import os
import re
from typing import List, Dict

import litellm


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


async def verify_claim(claim: Dict, evidence: List[Dict]) -> Dict:
    """Hybrid 3-layer verification: LLM (Gemini Pro) + Rule checks + Conflict detection."""
    cid = claim["id"]
    claim_text = claim["claim"]

    if not evidence:
        return {
            "claimId": cid, "claim": claim_text,
            "verdict": "UNVERIFIABLE", "confidence": 0,
            "reasoning": "No web evidence could be retrieved for this claim.",
            "citations": [], "conflicting": False, "ruleFlags": [],
        }

    # Layer 2 & 3
    snippets = [e.get("snippet", "") for e in evidence]
    rule = _rule_validate(claim_text, snippets)
    is_conflicting = _detect_conflict(evidence)

    # Build evidence block for prompt
    ev_block = ""
    for i, e in enumerate(evidence[:5], 1):
        ev_block += (
            f"\n[{i}] {e['title']}  (Trust: {e.get('trust_score', 50)}/100)\n"
            f"URL: {e['url']}\nSnippet: {e['snippet']}\n"
        )

    extra = ""
    if rule["flags"]:
        extra += f"\nAUTO-CHECK: {'; '.join(rule['flags'])}"
    if is_conflicting:
        extra += "\nAUTO-CHECK: Evidence sources appear to CONFLICT."

    prompt = f"""You are a precise fact-checker. Evaluate the claim below using ONLY the evidence provided.

CLAIM: "{claim_text}"

EVIDENCE (ranked by credibility):
{ev_block}{extra}

Think step by step:
1. What does each piece of evidence say?
2. Do the sources agree or contradict each other?
3. Are the sources credible and relevant?
4. Does the evidence support, refute, or not address the claim?

CRITICAL: Base the verdict solely on the evidence. Do NOT use prior knowledge.

Respond with ONLY valid JSON (no markdown):
{{"verdict":"TRUE"|"FALSE"|"PARTIALLY_TRUE"|"UNVERIFIABLE","confidence":<0-100>,"reasoning":"<one paragraph>","key_indices":[<1-5>]}}"""

    try:
        gemini_key = os.getenv("GEMINI_API_KEY")
        groq_key = os.getenv("GROQ_API_KEY")
        
        if gemini_key:
            model = "gemini/gemini-1.5-pro-latest"
            api_key = gemini_key
        elif groq_key:
            model = "groq/llama-3.3-70b-versatile"
            api_key = groq_key
        else:
            raise ValueError("Neither GEMINI_API_KEY nor GROQ_API_KEY is configured.")

        resp = litellm.completion(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            api_key=api_key,
            temperature=0.1,
            max_tokens=600,
        )
        raw = resp.choices[0].message.content.strip()
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        parsed = json.loads(raw)

        verdict = parsed.get("verdict", "UNVERIFIABLE")
        confidence = int(parsed.get("confidence", 50))
        reasoning = parsed.get("reasoning", "")
        key_idx = parsed.get("key_indices", [1, 2])

        # Apply penalties
        if rule["penalty"]:
            confidence = max(0, confidence - 20)
        if is_conflicting and verdict == "TRUE":
            verdict = "PARTIALLY_TRUE"
            confidence = min(confidence, 65)

        # Build citations
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
        }

    except (json.JSONDecodeError, Exception) as e:
        return {
            "claimId": cid, "claim": claim_text,
            "verdict": "UNVERIFIABLE", "confidence": 20,
            "reasoning": "Verification response could not be parsed.",
            "citations": [{"title": e["title"], "url": e["url"], "snippet": e["snippet"][:200], "trustScore": e.get("trust_score", 50)} for e in evidence[:2]],
            "conflicting": is_conflicting, "ruleFlags": rule["flags"],
        }
