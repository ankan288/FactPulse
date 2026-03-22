"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import CitationChip from "@/components/CitationChip";

interface Citation {
  title: string;
  url: string;
  snippet: string;
  trustScore: number;
}

interface ClaimResult {
  claimId: number;
  claim: string;
  verdict: "TRUE" | "FALSE" | "PARTIALLY_TRUE" | "UNVERIFIABLE";
  confidence: number;
  reasoning: string;
  citations: Citation[];
  conflicting: boolean;
  ruleFlags: string[];
}

interface Claim {
  id: number;
  claim: string;
  context: string;
  ambiguous: boolean;
  status: "pending" | "searching" | "verifying" | "done";
  result?: ClaimResult;
}

interface Props { claim: Claim; index: number; }

const VERDICT_META = {
  TRUE:            { label: "True",           icon: "✓", cls: "verdict-true" },
  FALSE:           { label: "False",          icon: "✗", cls: "verdict-false" },
  PARTIALLY_TRUE:  { label: "Partially True", icon: "~", cls: "verdict-partial" },
  UNVERIFIABLE:    { label: "Unverifiable",   icon: "?", cls: "verdict-none" },
};

export default function ClaimCard({ claim, index }: Props) {
  const [expanded, setExpanded] = useState(false);
  const meta = claim.result ? VERDICT_META[claim.result.verdict] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.04 }}
      className="glass"
      style={{ overflow: "hidden" }}
    >
      {/* Header row */}
      <div
        onClick={() => claim.status === "done" && setExpanded((x) => !x)}
        style={{
          display: "flex", alignItems: "flex-start", gap: "14px",
          padding: "18px 20px",
          cursor: claim.status === "done" ? "pointer" : "default",
        }}
      >
        {/* Index badge */}
        <div style={{
          width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
          background: "var(--bg-mid)", border: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "12px", fontWeight: 700, color: "var(--text-muted)",
        }}>
          {index + 1}
        </div>

        {/* Claim text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: "14px", lineHeight: 1.6, color: "var(--text-primary)" }}>
            {claim.claim}
            {claim.ambiguous && (
              <span style={{ marginLeft: 8, fontSize: "11px", color: "var(--accent-cyan)", fontWeight: 600 }}>
                ⚡ Ambiguous
              </span>
            )}
          </p>

          {/* Status indicators */}
          {claim.status === "searching" && (
            <p style={{ marginTop: 8, fontSize: "12px", color: "var(--text-muted)" }}>
              🔍 Searching web evidence…
            </p>
          )}
          {claim.status === "verifying" && (
            <p style={{ marginTop: 8, fontSize: "12px", color: "var(--text-muted)" }}>
              ⚖️ Verifying against evidence…
            </p>
          )}
          {claim.status === "pending" && (
            <div style={{ marginTop: 8 }}>
              <div className="skeleton" style={{ width: "60%", height: 12 }} />
            </div>
          )}
        </div>

        {/* Right side: verdict badge + confidence */}
        {claim.status === "done" && meta && claim.result && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px", flexShrink: 0 }}>
            <span className={`verdict-badge ${meta.cls}`}>
              {meta.icon} {meta.label}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{ width: 60, height: 4, background: "var(--border)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 4,
                  width: `${claim.result.confidence}%`,
                  background: `var(--verdict-${claim.result.verdict === "TRUE" ? "true" : claim.result.verdict === "FALSE" ? "false" : claim.result.verdict === "PARTIALLY_TRUE" ? "partial" : "none"})`,
                }} />
              </div>
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{claim.result.confidence}%</span>
            </div>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              {expanded ? "▲ Collapse" : "▼ Expand"}
            </span>
          </div>
        )}

        {/* Skeleton for loading */}
        {(claim.status === "searching" || claim.status === "verifying") && (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", flexShrink: 0, alignItems: "flex-end" }}>
            <div className="skeleton" style={{ width: 80, height: 22 }} />
            <div className="skeleton" style={{ width: 60, height: 10 }} />
          </div>
        )}
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && claim.result && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <div style={{ padding: "18px 20px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
              {/* Reasoning */}
              <div>
                <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                  Reasoning
                </p>
                <p style={{ fontSize: "13px", lineHeight: 1.7, color: "var(--text-secondary)" }}>
                  {claim.result.reasoning}
                </p>
              </div>

              {/* Conflict warning */}
              {claim.result.conflicting && (
                <div style={{ padding: "10px 14px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 8, fontSize: "12px", color: "#f59e0b" }}>
                  ⚡ Conflicting evidence detected — sources disagree on this claim.
                </div>
              )}

              {/* Rule flags */}
              {claim.result.ruleFlags?.length > 0 && (
                <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, fontSize: "12px", color: "#fca5a5" }}>
                  🔢 Auto-check flags: {claim.result.ruleFlags.join(" · ")}
                </div>
              )}

              {/* Citations */}
              {claim.result.citations.length > 0 && (
                <div>
                  <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                    Sources
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {claim.result.citations.map((c, i) => (
                      <CitationChip key={i} {...c} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export type { Claim, ClaimResult };
