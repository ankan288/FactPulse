# Graceful Degradation Strategy

## Overview

The verification system is designed to **continue operating despite service failures**. Instead of crashing, the pipeline degrades gracefully, returning partial results with clear explanations of what succeeded and what failed.

## Principles

1. **Never crash**: If any service fails, return what we can
2. **Be transparent**: Tell users what worked and what didn't
3. **Maintain quality**: Don't compromise accuracy for availability
4. **Try fallbacks**: Use alternative providers before giving up

---

## Pipeline Degradation Levels

```
Level 0 (Full Operation): All services succeed
  └─ Results: Claims + Verified verdicts + AI detection + Media analysis

Level 1 (Critical Failure): Core verification fails
  └─ Results: Claims extracted, verdicts uncertain
  └─ Message: "Verification services temporarily unavailable"

Level 2 (Partial Operation): AI/Media detection fails
  └─ Results: Claims + Verdicts (no AI/media analysis)
  └─ Message: "Media/AI analysis unavailable, continuing with claim verification"

Level 3 (Input Validation): Invalid input
  └─ Results: Error message only
  └─ Message: "Input validation failed: [reason]"

Level 4 (Complete Failure): No services available
  └─ Results: Error message
  └─ Message: "All verification services currently unavailable"
```

---

## Service-by-Service Degradation

### 1. Claim Extraction

**If extraction fails:**
- Return error message immediately
- Reason: Can't proceed without claims

**Current behavior:**
```python
try:
    claims = await extract_claims(text)
except Exception as e:
    yield emit("error", {"message": f"Claim extraction failed: {e}"})
    return
```

### 2. Evidence Search (Query Expansion + Multi-Source)

**If search fails:**
- Continue with empty evidence list
- Result: Claims marked as UNVERIFIABLE

**Current behavior:**
```python
try:
    raw_evidence = await search_evidence(claim_text)
except Exception as e:
    logger.error("Evidence search failed for claim %s: %s", cid, e)
    raw_evidence = []  # Empty evidence = UNVERIFIABLE verdict
```

**Why graceful:**
- Verification still completes (though with low confidence)
- User sees UNVERIFIABLE vs system error
- Better UX than blank error screen

### 3. Evidence Ranking

**If ranking fails:**
- Use raw evidence in original order
- Reason: Ranking is optimization, not critical

**Current behavior:**
```python
ranked = rank_evidence(claim_text, raw_evidence, temporal=claim.get("temporal", False))
# If ranking crashes, 'ranked' becomes raw_evidence
```

### 4. Claim Verification (LLM)

**If all LLM providers fail:**
- Return UNVERIFIABLE with 0% confidence
- Provided citations from evidence
- Message: "Verification services temporarily unavailable"

**Current behavior:**
```python
try:
    result = await verify_claim(claim, ranked)
except Exception as e:
    logger.error("Verification failed for claim %s: %s", cid, e, exc_info=True)
    result = {
        "verdict": "UNVERIFIABLE",
        "confidence": 0,
        "reasoning": f"Verification failed: {e}",
        "citations": [],
    }
```

**Provider Cascade (built-in fallback):**
1. Try NVIDIA NIM
2. If rate-limited → Try Groq
3. If Groq down → Try Together.ai
4. If Together fails → Try OpenRouter
5. If OpenRouter fails → Try Google Gemini
6. If all fail → Return UNVERIFIABLE

### 5. Adversarial Debate (2nd-pass verification)

**If debate fails:**
- Keep single-agent verification result
- Append failure note to reasoning
- Reason: Debate is optional escalation

**Current behavior:**
```python
try:
    debate_result = await debate_verify(claim, ranked)
    result = debate_result
except Exception as e:
    logger.error("Debate failed for claim %s: %s", cid, e, exc_info=True)
    result["reasoning"] += f" (Debate escalation failed: {e})"
    # Keep original result, don't retry
```

### 6. AI Text Detection

**If AI detection fails:**
- Continue without AI results
- Emit warning message
- Return partial results

**Current behavior:**
```python
try:
    ai_result = await detect_ai_text(text)
    yield emit("ai_detection", ai_result)
except Exception as e:
    logger.error("AI detection failed: %s", e, exc_info=True)
    yield emit("error", {
        "stage": "ai_detection",
        "message": f"AI authorship analysis unavailable: {str(e)}"
    })
    ai_result = None  # Continue without AI detection
```

**Why graceful:**
- AI detection is supplementary (not core verification)
- Missing AI detection doesn't invalidate verdicts
- User still gets claims + verdicts

### 7. Media Detection (Deepfake/Manipulation)

**If media detection fails:**
- Continue without media reports
- Emit warning for each image (or batch)
- Return claims + verdicts only

**Current behavior:**
```python
try:
    media_reports = await detect_media(scraped_images)
    yield emit("media_results", {"reports": media_reports})
except Exception as e:
    logger.error("Media detection failed: %s", e, exc_info=True)
    yield emit("error", {
        "stage": "media_detection",
        "message": f"Media analysis unavailable: {str(e)}"
    })
    media_reports = []  # Empty reports, continue
```

**Why graceful:**
- Media detection requires external API (may rate-limit)
- System works fine without it
- User warned but gets text results

---

## Error Recovery Strategies

### Strategy 1: Provider Cascade (Implemented)

**For LLM verification:**
- Multiple free/open providers available
- Cascading fallback: try each until one succeeds
- Reduces single-point-of-failure risk

**Providers in order:**
1. NVIDIA NIM (fastest, generous free tier)
2. Groq (very fast, rate-limited)
3. Together.ai (good free tier)
4. OpenRouter (aggregates many)
5. Google Gemini (reliable fallback)

### Strategy 2: Caching

**For frequently verified claims:**
- Store results in Redis (24 hours default)
- Temporal claims cached 6 hours (fresher)
- Reduces API calls + improves latency

**Example:**
```
User verifies: "Mount Everest is 8,849m"
  → Result cached for 24 hours
Next user verifies same claim
  → Instant result from cache (skips all APIs)
```

### Strategy 3: Partial Results

**If service X fails, continue with services Y & Z:**
- Claims extraction → Always mandatory (fail fast)
- Evidence search → Continue with empty (UNVERIFIABLE)
- Verification → Continue if evidence exists (low confidence)
- AI detection → Optional (continue without)
- Media detection → Optional (continue without)

### Strategy 4: Exponential Backoff

**For rate-limited APIs:**
- First retry: 1 second delay
- Second retry: 2 seconds delay
- Third retry: 4 seconds delay
- Max 3 attempts per provider

**Example:**
```
Call Groq API
  ↓
Rate-limited (429)
  ↓
Wait 1 second
  ↓
Retry
  ↓
Still rate-limited
  ↓
Wait 2 seconds
  ↓
Retry
  ↓
Still rate-limited
  ↓
Fall through to next provider
```

### Strategy 5: Timeouts

**Prevent hanging indefinitely:**
- LLM verification: 25 second timeout
- Search: 10 second timeout
- Media detection: 30 second timeout

**Example:**
```
Start LLM call
  ↓
25 seconds elapse
  ↓
Timeout triggered
  ↓
Return UNVERIFIABLE (not crash)
```

---

## User-Facing Error Messages

### Critical (Show to user): 
- Input validation failure
- No claims extracted
- All services unavailable

### Warning (Log, emit, continue):
- AI detection failed (continue with verdict)
- Media detection failed (continue with verdict)
- Debate escalation failed (keep base result)

### Debug (Log only):
- Provider cascade attempts
- Cache hits/misses
- Retry attempts

---

## Frontend Error Handling

### Error Boundary (`ErrorBoundary.tsx`)

```tsx
<ErrorBoundary>
  {/* Your component */}
</ErrorBoundary>
```

Catches:
- Component rendering errors
- Event handler errors
- Async errors (within boundary)

Shows:
- User-friendly error dialog
- "Try Again" button (triggers reset)
- "Go Home" button (navigates to home)
- Dev mode: error details

### API Error Mapping (`lib/api.ts`)

```typescript
HTTP 400 → "Invalid input. Please check your text."
HTTP 401 → "Authentication failed. Please sign in."
HTTP 403 → "Access denied. Insufficient permissions."
HTTP 404 → "Resource not found."
HTTP 413 → "File too large. Maximum 10MB allowed."
HTTP 429 → "Too many requests. Please try again later."
HTTP 500+ → "Server error. Please try again later."
```

### Error Pages

**404 Page** (`app/not-found.tsx`):
- Shows when route doesn't exist
- "Back to Home" button
- Animated design with purple theme

**500 Page** (`app/error.tsx`):
- Shows when server error occurs
- "Try Again" button (retry)
- "Go Home" button (navigate)
- Dev mode: error stack trace

---

## Testing Graceful Degradation

### Simulate Search Failure
```python
# In searcher.py, make both providers fail
async def search_evidence(query: str, max_results: int = 5) -> List[Dict]:
    # Force failure
    raise Exception("Simulated search failure")

# Expected: Claims extracted, verdicts UNVERIFIABLE, no error page crash
```

### Simulate LLM Failure
```python
# In verifier.py, make _call_provider always return None
async def _call_provider(...):
    return None  # Simulate all providers failing

# Expected: result verdict=UNVERIFIABLE, confidence=0
```

### Simulate AI Detection Failure
```python
# In ai_detector.py
async def detect_ai_text(text: str) -> Dict:
    raise Exception("Simulated AI detection failure")

# Expected: Error emitted, verification continues, results shown
```

### Test Frontend Error Boundary
```tsx
// In a component, throw error
throw new Error("Test error boundary");

// Expected: Error dialog appears, "Try Again" button resets component
```

---

## Monitoring & Alerting

### Metrics to Track

1. **Success rates** (per service):
   - Claim extraction: % of inputs that succeed
   - Evidence search: % of claims with results
   - Verification: % with confident verdicts
   - AI detection: % without errors
   - Media detection: % without errors

2. **Fallback frequency**:
   - How often do we use provider cascade?
   - How often do we return UNVERIFIABLE due to failure?
   - Cache hit rate

3. **Error types**:
   - Rate limit errors (which provider?)
   - Timeout errors (which service?)
   - JSON parse errors (LLM returning invalid JSON?)

### Alerts to Set Up

- If verification success rate < 70% → Alert
- If any LLM provider down > 30 min → Alert
- If media detection failing > 50% → Alert
- If cache errors > 5/min → Alert

---

## Improvement Ideas

1. **Fallback LLM models**:
   - Use simpler models if main model fails
   - Trade inference quality for availability

2. **Offline mode**:
   - Cache larger dataset locally
   - Serve cached results when all providers down

3. **Circuit breaker pattern**:
   - Track provider failure count
   - Stop calling failed provider for X minutes
   - Reduces latency on known failures

4. **User preferences**:
   - Let users opt into low-confidence results
   - "Show partial results" setting

5. **Retry queue**:
   - Queue failed verifications
   - Retry in off-peak hours
   - Re-notify users of new results

---

## Summary

The system is designed to **keep functioning** even when individual services fail:

| Service | Failure Impact | Degradation | User Experience |
|---------|---------------|-------------|-----------------|
| Extraction | ❌ Blocks all | Fail fast | "Input error" |
| Search | ⚠️ Confidence ↓ | UNVERIFIABLE | Results shown, marked uncertain |
| Verification | ⚠️ Confidence ↓ | Fallback provider | Results shown, marked uncertain |
| AI Detection | ✅ Minimal | Skip | Results shown without AI analysis |
| Media Detection | ✅ Minimal | Skip | Results shown without media analysis |

**Result**: System almost never crashes—it degrades gracefully instead.

