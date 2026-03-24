# Verification Logic - Developer Guide

## Quick Overview

The fact verification system is located in `backend/services/verifier.py` and uses a 3-layer hybrid approach:

- **Layer 1**: LLM reasoning with few-shot examples + self-verification
- **Layer 2**: Rule-based numeric validation
- **Layer 3**: Conflict detection between sources

## File Structure

```
backend/
├── services/
│   ├── verifier.py          ← Main verification logic
│   ├── searcher.py          ← Evidence retrieval (with query expansion)
│   ├── ranker.py            ← Evidence ranking by relevance
│   └── ai_detector.py       ← AI-generated content detection
├── utils/
│   ├── llm_retry.py         ← Retry logic with exponential backoff
│   └── cache.py             ← Optional Redis caching
├── models.py                ← Pydantic data models
├── main.py                  ← FastAPI routes
└── VERIFICATION_LOGIC.md    ← This document
```

## How to Modify Verification Logic

### 1. Adjust Few-Shot Examples

**Location**: `verifier.py`, line ~250 (in `verify_claim` function)

```python
fewshot_examples = """
## Example 1: ...
CLAIM: "..."
EVIDENCE: [...]
...
"""
```

**Why**: Few-shot examples significantly improve LLM reasoning quality. They teach the model:
- How to interpret different types of claims
- What confidence levels are appropriate
- How to handle conflicting evidence

**Best practice**: Add examples for edge cases your system encounters frequently.

### 2. Change Confidence Caps

**Location**: `verifier.py`, lines ~410-430 (adjustment phase)

```python
# Temporal claim cap
if is_temporal and verdict in ("TRUE", "PARTIALLY_TRUE"):
    confidence = min(confidence, 70)  # ← Change 70 to adjust cap

# Ambiguous claim cap
if is_ambiguous and verdict == "TRUE":
    confidence = min(confidence, 65)  # ← Change 65 to adjust cap
```

**Why**: These caps prevent overconfidence on uncertain claims.

### 3. Modify Rule Violations Penalty

**Location**: `verifier.py`, line ~408

```python
if rule["penalty"]:
    confidence = max(0, confidence - 20)  # ← Change 20 to adjust penalty
```

**Why**: Numeric mismatches should reduce confidence. Adjust penalty based on how much you trust rules vs. LLM.

### 4. Add New Special Case Instructions

**Location**: `verifier.py`, lines ~230-250 (special_instructions block)

```python
if is_some_new_condition:
    special_instructions += (
        "\n⚠️ SPECIAL CONDITION: Your instruction here. "
        "How should the LLM treat this case?\n"
    )
```

**Examples**: Political claims, scientific consensus claims, medical claims

### 5. Adjust Conflict Detection Threshold

**Location**: `verifier.py`, line ~428

```python
if is_conflicting and verdict == "TRUE":
    verdict = "PARTIALLY_TRUE"
    # Current: max(40, 75 - conflict_score // 4)
    # This means: if 40% conflict, confidence capped at 75 - 10 = 65
    
    max_conf = max(40, 75 - conflict_score // 4)  # ← Modify formula
    confidence = min(confidence, max_conf)
```

**Formula explanation**:
- `max(40, ...)` ensures confidence never drops below 40%
- `75 - conflict_score // 4` caps confidence based on conflict strength
- `conflict_score // 4` means each 4% of conflict reduces confidence by 1%

---

## How to Add New Providers

The system supports multiple LLM providers for redundancy.

**Location**: `verifier.py`, function `_get_available_providers()`

```python
# Add new provider:
new_key = os.getenv("NEW_PROVIDER_API_KEY")
if new_key:
    providers.append((
        "new_provider/model-name",
        new_key,
        "optional_api_base_url"  # None if not needed
    ))

return providers
```

**Why**: More providers = higher reliability. System tries each until one succeeds.

**Example: Adding OpenAI**
```python
openai_key = os.getenv("OPENAI_API_KEY")
if openai_key:
    providers.append((
        "gpt-4-turbo",
        openai_key,
        None  # OpenAI doesn't need custom api_base
    ))
```

---

## How to Modify Rule Validation

**Location**: `verifier.py`, function `_rule_validate()`

```python
def _rule_validate(claim: str, snippets: List[str]) -> Dict:
    """Current: Numeric mismatch detection (±15% tolerance)
    
    To add new rules:
    1. Extract relevant information from claim/evidence
    2. Compare and identify mismatches
    3. Add to flags list
    4. Return flags + penalty
    """
    
    # Current logic
    combined = " ".join(snippets)
    claim_nums = _extract_numbers(claim)
    ev_nums = _extract_numbers(combined)
    flags = []
    
    # Example: Add date consistency check
    claim_dates = _extract_dates(claim)  # ← New function needed
    ev_dates = _extract_dates(" ".join(snippets))  # ← New function needed
    for cd in claim_dates:
        if cd not in ev_dates:
            flags.append(f"Date mismatch: '{cd}' not found in evidence")
    
    return {"flags": flags, "penalty": len(flags) > 0}
```

---

## How to Customize Verdict Penalties

After LLM reasoning, the system applies penalties and caps based on context.

**Location**: `verifier.py`, lines ~407-435 (adjustment phase)

**Current flow**:
1. Rule violations → -20 confidence
2. High conflict + TRUE → downgrade to PARTIALLY_TRUE, cap confidence
3. Temporal claim → cap at 70%
4. Ambiguous claim → cap at 65%

**Example: Add political claim penalty**
```python
is_political = claim.get("political", False)  # ← Requires new field

...after LLM reasoning...

if is_political:
    # Political claims require higher standards
    if verdict == "TRUE":
        confidence = min(confidence, 65)  # Cap at 65% for political claims
    special_instructions += "\n⚠️ POLITICAL CLAIM: Be extra cautious about claims that could be partisan."
```

---

## Testing & Debugging

### Manual Test
```python
import asyncio
from services.verifier import verify_claim

claim = {"id": 1, "claim": "Mount Everest is 8,849m tall"}
evidence = [
    {
        "title": "Wikipedia: Mount Everest",
        "url": "https://en.wikipedia.org/wiki/Mount_Everest",
        "snippet": "Mount Everest is 8,849 meters (29,032 feet) tall",
        "source": "web",
        "trust_score": 85
    }
]

result = asyncio.run(verify_claim(claim, evidence))
print(f"Verdict: {result['verdict']}")
print(f"Confidence: {result['confidence']}%")
print(f"Reasoning: {result['reasoning']}")
```

### Debug LLM Response
```python
# In verify_claim(), after LLM response:
print(f"[DEBUG] Raw LLM response:\n{raw}")
```

### Log Evidence Processing
```python
# In verify_claim(), before building prompt:
logger.debug(f"[VERIFY] Claim {cid}: {claim_text}")
logger.debug(f"[VERIFY] Evidence count: {len(evidence)}")
logger.debug(f"[VERIFY] Rule flags: {rule['flags']}")
logger.debug(f"[VERIFY] Conflict detected: {is_conflicting}")
```

---

## Performance Tuning

### Reduce Latency

1. **Fewer evidence sources**: Only process top 3-5 sources (default: 5)
   ```python
   for i, e in enumerate(evidence[:3], 1):  # Process only top 3
   ```

2. **Shorter token limit**: Reduce `max_tokens` in `_call_provider()`
   ```python
   raw = await _call_provider(model, api_key, api_base, prompt, max_tokens=500)  # was 1000
   ```

3. **Simpler LLM prompt**: Fewer examples = faster response
   ```python
   # Use only 1-2 examples instead of 3
   fewshot_examples = "## Example 1: ...\n..."
   ```

### Improve Quality

1. **Add more examples**: 4-5 examples > 2-3 examples
2. **More detailed instructions**: Explicit reasoning steps
3. **Higher temperature**: `temperature=0.1` → `temperature=0.3` for more variety (risky)

---

## Common Issues & Fixes

### Issue: All verdicts are PARTIALLY_TRUE
**Cause**: High conflict detection threshold

**Fix**:
```python
# Increase threshold for conflict reporting
if is_conflicting:  # ← Only when truly conflicted
    is_conflicting = conflict_score > 40  # Require >40% conflict
```

### Issue: Confidence always capped at 70%
**Cause**: Temporal flag applied too broadly

**Fix**:
```python
# Only apply temporal cap to current-state claims
is_temporal = claim.get("temporal", False) and "current" in claim_text.lower()
```

### Issue: LLM frequently returns invalid JSON
**Cause**: Overly complex prompt

**Fix**:
```python
prompt = f"""...(shorter prompt with fewer examples)..."""
```

### Issue: Rule violations never detected
**Cause**: Numeric extraction not finding numbers

**Fix**:
```python
# Debug numeric extraction
print(f"[DEBUG] Claim numbers: {_extract_numbers(claim_text)}")
print(f"[DEBUG] Evidence numbers: {_extract_numbers(combined)}")
```

---

## Architecture Decisions

### Why Chain-of-Thought?
- Breaks down complex reasoning into steps
- Makes mistakes visible (easier to debug)
- Improves inference quality

### Why Few-Shot Examples?
- More efficient than long instructions
- Models learn reasoning patterns from examples
- Handles edge cases naturally

### Why Hybrid LLM + Rules + Conflict?
- **LLM**: Great at nuanced reasoning
- **Rules**: Catches systematic errors
- **Conflict**: Detects contradictions LLM might miss
- **Together**: Robust, accurate, debuggable

### Why Confidence Caps?
- Prevents false confidence
- Communicates uncertainty
- Enables prioritization (high-confidence claims more actionable)

---

## Future Enhancements

1. **Multi-hop reasoning**: Verify claims that depend on other claims
2. **Source credibility learning**: Update trust scores based on historical accuracy
3. **Reasoning transparency**: Show users the exact reasoning steps
4. **A/B testing**: Compare different prompt variations
5. **Fine-tuned models**: Train custom models on domain-specific data

