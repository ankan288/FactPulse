# Fact & Claim Verification Logic

## Overview

The verification system uses a **3-Layer Hybrid Approach** combining LLM reasoning, rule-based checks, and conflict detection to produce accurate, confident verdicts on factual claims.

```
Input: Claim + Evidence
  ↓
┌─────────────────────────────────────────┐
│  Layer 1: LLM Chain-of-Thought          │ ← Few-shot examples
│  (Deep reasoning with self-verification)│ ← Self-correction loop
├─────────────────────────────────────────┤
│  Layer 2: Rule-Based Validation         │ ← Numeric checks
│  (Numeric & date consistency)           │ ← Temporal analysis
├─────────────────────────────────────────┤
│  Layer 3: Conflict Detection            │ ← Stance analysis
│  (Contradiction analysis)               │ ← Trust weighting
├─────────────────────────────────────────┤
│  Final Adjustment Phase                 │ ← Penalties & caps
│  (Confidence scaling)                   │ ← Special case handling
└─────────────────────────────────────────┘
  ↓
Output: Verdict + Confidence + Reasoning
```

---

## Layer 1: LLM Chain-of-Thought Reasoning

### Purpose
Use a large language model to understand complex relationships between claims and evidence, weighing credibility and handling nuance that rules cannot.

### Approach: Few-Shot In-Context Learning

The prompt includes **concrete examples** showing how to evaluate different types of claims:

```markdown
## Example 1: Simple Factual Claim
CLAIM: "Mount Everest is the tallest mountain in the world"
EVIDENCE: [Everest 8,849m | K2 8,611m | Kangchenjunga 8,586m]
VERDICT: TRUE (95% confidence)

## Example 2: Conflicting Evidence
CLAIM: "Climate change is primarily caused by human activity"
EVIDENCE: [Scientific consensus 97% | Oil industry source disputes it]
VERDICT: TRUE (75% confidence, reduced due to minority dissent)

## Example 3: Temporal/Ambiguous Claim
CLAIM: "The CEO of Apple is Tim Cook"
EVIDENCE: [Tim Cook since 2011 | Current CEO Tim Cook | 2024: Tim Cook leads Apple]
VERDICT: TRUE (85% confidence, capped due to potential leadership change)
```

**Why examples help:**
- Demonstrates how to handle conflicting sources
- Shows proper confidence calibration (95% vs 75% vs 85%)
- Models reasoning for temporal/ambiguous claims
- Improves model's adherence to task structure

### Self-Verification Loop

The LLM is instructed to explicitly challenge its own reasoning:

```python
"step_3_self_verification": "<Challenge your initial assumption. 
  Ask yourself:
  - Am I relying too heavily on one source?
  - Could there be an alternative interpretation?
  - Is the evidence strong enough, or just partially supporting?>"
```

**Example flow:**
1. Initial thought: "All three sources say it's true → verdict is TRUE"
2. Self-check: "But wait—are those three sources independent or citing each other?"
3. Correction: "Actually, source [2] is more credible (higher trust score). If I weight it heavily, it says PARTIALLY_TRUE"
4. Final verdict: Adjusted confidence downward

### Structured JSON Response

The LLM returns a detailed reasoning breakdown:

```json
{
  "step_1_evidence_analysis": "Describe what each source says",
  "step_2_conflict_detection": "Identify any disagreements",
  "step_3_self_verification": "Challenge your reasoning; alternative interpretations?",
  "step_4_confidence_reasoning": "Why this confidence level?",
  "verdict": "TRUE|FALSE|PARTIALLY_TRUE|UNVERIFIABLE",
  "confidence": 75,
  "reasoning": "User-facing explanation",
  "key_indices": [1, 2]
}
```

---

## Layer 2: Rule-Based Validation

### Purpose
Catch systematic errors that LLMs might miss (especially numeric/date mismatches).

### Numeric Consistency Check

**Algorithm:**
1. Extract all numbers from claim (e.g., years, percentages, populations)
2. Extract all numbers from evidence
3. For each claim number, check if it appears in evidence (±15% tolerance)
4. Flag mismatches as `ruleFlags`

**Example:**
```
Claim: "The event happened in 2005 with 50 million participants"
Evidence: [2003 founding date, 5 million attendees in 2024]
  
Rule check:
  - Claim number: 2005 → No match in evidence (2003 is ±15% but for years, must be exact)
    FLAG: "Numeric mismatch: '2005' not found in evidence"
  - Claim number: 50 million → Evidence has 5 million (10% match)
    FLAG: "Numeric mismatch: '50' not found in evidence"

Result: confidence -= 20 (penalty for rule violations)
```

**Tolerance: ±15% for approximate matches**
- Allows for rounding: 1000 vs 1023 (2.3% difference, accepted)
- Rejects significant changes: 1000 vs 1500 (50% difference, rejected)

### Special Handling

- **Temporal claims**: Prioritize recent evidence; cap confidence at 70%
- **Ambiguous claims**: Can't be fully TRUE if interpretation is unclear; cap at 65%
- **Numeric red flags**: Any mismatch → confidence penalty

---

## Layer 3: Conflict Detection

### Purpose
Identify contradictory stances in sources and prevent overconfident verdicts when genuine disagreement exists.

### Stance Analysis

**Positive keywords:** "confirms", "proves", "supports", "demonstrates", "verified"
**Negative keywords:** "refutes", "debunks", "contradicted", "disputed", "misleading"

**Algorithm:**
1. Scan first 5 evidence snippets for keyword presence
2. Count positive-stance sources vs negative-stance sources
3. If both types found → report conflicting evidence

**Example:**
```
Evidence [0]: "Study confirms the hypothesis is TRUE"     → POSITIVE stance
Evidence [1]: "Research debunks the popular myth"          → NEGATIVE stance
Evidence [2]: "Consensus supports the conclusion"         → POSITIVE stance

Result: Conflict detected (2 positive, 1 negative)
Conflict strength = 1/3 = 33% (mild conflict)
```

### Conflict Strength Calculation

Formula: `minority_stances / total_sources * 100`

- **0%**: Perfect agreement (no conflict)
- **25%**: One source disagrees, others agree (mild conflict)
- **50%**: Perfectly split evidence (severe conflict)
- **100%**: Purely hypothetical perfect split

**Applied during adjustment phase:**
```
If conflict_strength >= 30 and verdict == "TRUE":
  - Downgrade verdict to "PARTIALLY_TRUE"
  - Cap confidence: max(40, 75 - conflict_score // 4)
```

---

## Final Adjustment Phase

After LLM + Rules + Conflict analysis, the system applies final adjustments:

### 1. Rule Violations Penalty
```python
if rule["penalty"]:  # Any numeric mismatch detected
    confidence = max(0, confidence - 20)
```

### 2. Conflict-Based Downgrade
```python
if is_conflicting and verdict == "TRUE":
    verdict = "PARTIALLY_TRUE"
    max_conf = max(40, 75 - conflict_score // 4)
    confidence = min(confidence, max_conf)
```

Example:
- LLM says: TRUE with 95% confidence
- Conflict strength: 50% (perfectly split evidence)
- Result: PARTIALLY_TRUE with max 63% confidence (75 - 50//4 = 75 - 12 = 63)

### 3. Temporal Claim Cap
```python
if is_temporal and verdict in ("TRUE", "PARTIALLY_TRUE"):
    confidence = min(confidence, 70)
```

Rationale: Current-state claims may become outdated; never fully confident.

### 4. Ambiguous Claim Downgrade
```python
if is_ambiguous and verdict == "TRUE":
    verdict = "PARTIALLY_TRUE"
    confidence = min(confidence, 65)
```

Rationale: If claim is genuinely ambiguous and evidence addresses one interpretation, that's only PARTIALLY verified.

---

## Provider Cascade Strategy

### Problem
Single LLM API providers may be rate-limited, expensive, or unreliable.

### Solution: Cascading Fallback
System tries providers in order until one succeeds:

1. **NVIDIA NIM** (fastest) → `openai/meta/llama-3.1-70b-instruct`
2. **Groq** (very fast) → `groq/llama-3.3-70b-versatile`
3. **Together.ai** → `together_ai/meta-llama/Llama-3.3-70B-Instruct-Turbo`
4. **OpenRouter** → `openrouter/meta-llama/llama-3.1-70b-instruct`
5. **Google Gemini** (fallback) → `gemini/gemini-1.5-flash`

**Advantages:**
- No single point of failure (one provider down ≠ system down)
- Cost optimization (cheaper providers tried first)
- Geographic redundancy
- Automatic load balancing

---

## Key Design Decisions

### Why Few-Shot Examples?
- Improves token efficiency (model learns task from examples, not just instructions)
- Reduces hallucinations (examples ground the model in expected outputs)
- Enables handling of edge cases (conflicting evidence, temporal claims)

### Why Self-Verification?
- Catches reasoning errors the model might otherwise make
- Encourages intellectual honesty ("Is my confidence justified?")
- Reduces overconfidence on ambiguous claims

### Why Hybrid Approach (LLM + Rules + Conflict)?
- **LLM alone**: Great at reasoning but makes systematic errors (numeric mismatches)
- **Rules alone**: Catches numeric errors but misses nuance (conflicting credibility)
- **Hybrid**: Combines strengths, mitigates weaknesses

### Why Confidence Caps?
- Prevents false certainty on ambiguous/conflicting/temporal claims
- Communicates uncertainty to users
- Enables safe prioritization (high-confidence claims are more actionable)

---

## Testing the Verification System

### Simple Factual Claim
```
Input: "Mount Everest is 8,849 meters tall"
Expected: TRUE, 90%+ confidence

Reasoning:
- All sources agree (no conflict)
- Exact numeric match → no rule violations
- Simple factual question with clear evidence
```

### Conflicting Claim
```
Input: "Climate change is caused by humans"
Expected: TRUE or PARTIALLY_TRUE, 70-85% confidence

Reasoning:
- Scientific consensus (97%) supports → TRUE tendency
- Minority sources dispute → conflict detected
- Downgrade to PARTIALLY_TRUE or cap at 75%
```

### Temporal Claim
```
Input: "Elon Musk is the CEO of Tesla"
Expected: TRUE, 70% confidence (capped)

Reasoning:
- Evidence confirms current status → would be 95%
- Temporal flag applied → cap at 70%
- Prevents overconfidence in potentially outdated fact
```

### Ambiguous Claim
```
Input: "AI is dangerous"
Expected: PARTIALLY_TRUE or UNVERIFIABLE, 50-65% confidence

Reasoning:
- "Dangerous" is ambiguous (to whom? when? how?)
- Evidence addresses one interpretation → PARTIALLY_TRUE
- Ambiguous flag + LLM judgment → capped at 65%
```

---

## Future Improvements

1. **Extended Chain-of-Thought**: Add more reasoning steps (e.g., "How recent is evidence?")
2. **Citation Quality Scoring**: Better trust score calculation (domain, author, date)
3. **Consistency Checking**: Verify no contradictions across claims in same document
4. **Real-time Evidence**: Integration with live APIs for temporal claims
5. **Multi-hop Reasoning**: "Claim A depends on Claim B; verify B first"

