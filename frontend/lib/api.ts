// SSE streaming client for the verification pipeline

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface ClaimEvent {
  step: "claim";
  id: number;
  claim: string;
  context: string;
  ambiguous: boolean;
}

export interface ResultEvent {
  step: "result";
  claimId: number;
  claim: string;
  verdict: "TRUE" | "FALSE" | "PARTIALLY_TRUE" | "UNVERIFIABLE";
  confidence: number;
  reasoning: string;
  citations: { title: string; url: string; snippet: string; trustScore: number }[];
  conflicting: boolean;
  ruleFlags: string[];
}

export interface AIDetectionEvent {
  step: "ai_detection";
  score: number;
  label: "LIKELY_HUMAN" | "AI_ASSISTED" | "LIKELY_AI";
  signals: string[];
  stylometricFeatures: Record<string, number>;
}

export interface DoneEvent {
  step: "done";
  summary: {
    total: number;
    true: number;
    false: number;
    partial: number;
    unverifiable: number;
    overallScore: number;
  };
}

export type PipelineEvent =
  | { step: "status" | "extracting" | "detecting"; message: string }
  | { step: "claims_found"; count: number }
  | { step: "searching"; claimId: number; query: string }
  | { step: "verifying"; claimId: number }
  | { step: "error"; message: string }
  | ClaimEvent
  | ResultEvent
  | AIDetectionEvent
  | DoneEvent;

export async function streamVerify(
  payload: { text?: string; url?: string },
  onEvent: (event: PipelineEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(`${API_BASE}/api/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!response.body) throw new Error("No response body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const evt = JSON.parse(line.slice(6)) as PipelineEvent;
          onEvent(evt);
        } catch {
          // skip malformed events
        }
      }
    }
  }
}

export async function extractUrl(url: string): Promise<{ text: string; title: string; error?: string }> {
  const res = await fetch(`${API_BASE}/api/extract-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  return res.json();
}
