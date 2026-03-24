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

export interface FusionReport {
  final_verdict: string;
  unified_confidence: number;
  explanation: string;
  media_stats: {
    total: number;
    ai_generated: number;
    real: number;
  };
}

export interface MediaReport {
  url: string;
  ai_probability: number;
  label: string;
  reasoning: string;
  caption: string;
}

export interface Summary {
  total: number;
  true: number;
  false: number;
  partial: number;
  unverifiable: number;
  overallScore: number;
  averageConfidence: number;
  processingTime: number;
  confidenceDistribution: { range: string; count: number }[];
  topSources: { name: string; count: number }[];
}

export interface DoneEvent {
  step: "done";
  summary: Summary;
  fusion: FusionReport;
}

export type PipelineEvent =
  | { step: "status" | "extracting" | "detecting" | "media_detecting"; message: string }
  | { step: "text_extracted"; text: string }
  | { step: "media_results"; reports: MediaReport[] }
  | { step: "claims_found"; count: number }
  | { step: "searching"; claimId: number; query: string }
  | { step: "verifying"; claimId: number }
  | { step: "error"; message: string }
  | ClaimEvent
  | ResultEvent
  | AIDetectionEvent
  | DoneEvent;

export async function streamVerify(
  payload: { text?: string; url?: string } | FormData,
  onEvent: (event: PipelineEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  let url = `${API_BASE}/api/verify`;
  let options: RequestInit = {
    method: "POST",
    signal,
  };

  // Handle FormData (file upload) vs JSON
  if (payload instanceof FormData) {
    url = `${API_BASE}/api/upload`;
    options.body = payload;
    // Don't set Content-Type for FormData - browser will set it with boundary
  } else {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(payload);
  }

  try {
    const response = await fetch(url, options);

    // Handle HTTP errors
    if (!response.ok) {
      let errorMsg = `HTTP ${response.status}`;
      
      if (response.status === 400) {
        errorMsg = "Invalid input. Please check your text/URL and try again.";
      } else if (response.status === 401) {
        errorMsg = "Unauthorized. Please sign in.";
      } else if (response.status === 403) {
        errorMsg = "Access denied.";
      } else if (response.status === 404) {
        errorMsg = "Resource not found.";
      } else if (response.status === 413) {
        errorMsg = "File too large. Maximum size is 10MB.";
      } else if (response.status === 429) {
        errorMsg = "Too many requests. Please wait a moment and try again.";
      } else if (response.status >= 500) {
        errorMsg = "Server error. Please try again later.";
      }

      throw new Error(errorMsg);
    }

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
          } catch (e) {
            console.warn("Failed to parse event:", line, e);
            // skip malformed events
          }
        }
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        throw error; // Re-throw AbortError so caller can handle cancellation
      }
      throw new Error(error.message || "Network error. Please check your connection.");
    }
    throw new Error("Unknown error occurred");
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
