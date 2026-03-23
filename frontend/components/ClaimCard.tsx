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

interface Props {
  claim: Claim;
  index: number;
  isHovered?: boolean;
  onHover?: (id: number | null) => void;
}

const VERDICT_META = {
  TRUE:            { label: "True",           icon: "✓", cls: "verdict-true" },
  FALSE:           { label: "False",          icon: "✗", cls: "verdict-false" },
  PARTIALLY_TRUE:  { label: "Partially True", icon: "~", cls: "verdict-partial" },
  UNVERIFIABLE:    { label: "Unverifiable",   icon: "?", cls: "verdict-none" },
};

// Evidence snippet preview component with expandable functionality
function EvidenceSnippetPreview({ citations }: { citations: Citation[] }) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  if (citations.length === 0) return null;

  return (
    <div style={{ marginTop: "14px" }}>
      <p style={{
        fontSize: "11px",
        fontWeight: 700,
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        marginBottom: "10px"
      }}>
        Evidence Snippets
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {citations.map((citation, i) => {
          const isExpanded = expandedIndex === i;
          const domain = (() => {
            try {
              return new URL(citation.url).hostname.replace("www.", "");
            } catch {
              return citation.url;
            }
          })();

          const trustColor = citation.trustScore >= 70 ? "#22c55e" :
                            citation.trustScore >= 40 ? "#f59e0b" : "#ef4444";

          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              style={{
                background: "rgba(0,0,0,0.3)",
                border: `1px solid ${isExpanded ? trustColor + "50" : "var(--border)"}`,
                borderRadius: "10px",
                overflow: "hidden",
                transition: "all 0.2s ease",
              }}
            >
              {/* Header */}
              <div
                onClick={() => setExpandedIndex(isExpanded ? null : i)}
                style={{
                  padding: "10px 14px",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  cursor: "pointer",
                  background: isExpanded ? "rgba(255,255,255,0.02)" : "transparent",
                }}
              >
                {/* Trust indicator */}
                <div style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: trustColor,
                  flexShrink: 0,
                }} />

                {/* Source info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {citation.title || domain}
                  </p>
                  <p style={{
                    fontSize: "11px",
                    color: "var(--text-muted)",
                    marginTop: "2px",
                  }}>
                    {domain} • Trust: {citation.trustScore}%
                  </p>
                </div>

                {/* Expand/collapse arrow */}
                <span style={{
                  fontSize: "10px",
                  color: "var(--text-muted)",
                  transition: "transform 0.2s",
                  transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                }}>
                  ▼
                </span>
              </div>

              {/* Expanded content */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div style={{
                      padding: "0 14px 14px",
                      borderTop: "1px solid var(--border)",
                    }}>
                      {/* Snippet preview */}
                      <div style={{
                        marginTop: "12px",
                        padding: "12px",
                        background: "rgba(139, 92, 246, 0.05)",
                        borderRadius: "8px",
                        borderLeft: `3px solid ${trustColor}`,
                      }}>
                        <p style={{
                          fontSize: "13px",
                          lineHeight: 1.7,
                          color: "var(--text-secondary)",
                          fontStyle: "italic",
                        }}>
                          "{citation.snippet}"
                        </p>
                      </div>

                      {/* Link to source */}
                      <a
                        href={citation.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          marginTop: "10px",
                          padding: "6px 12px",
                          borderRadius: "6px",
                          background: "rgba(255,255,255,0.05)",
                          border: "1px solid var(--border)",
                          color: "var(--accent-cyan)",
                          fontSize: "12px",
                          textDecoration: "none",
                          transition: "all 0.15s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                          e.currentTarget.style.borderColor = "var(--accent-cyan)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                          e.currentTarget.style.borderColor = "var(--border)";
                        }}
                      >
                        View Source ↗
                      </a>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

export default function ClaimCard({ claim, index, isHovered, onHover }: Props) {
  const [expanded, setExpanded] = useState(false);
  const meta = claim.result ? VERDICT_META[claim.result.verdict] : null;

  return (
    <motion.div
      id={`claim-${claim.id}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.04 }}
      className="glass"
      style={{
        overflow: "hidden",
        boxShadow: isHovered ? "0 0 0 2px rgba(139, 92, 246, 0.4)" : "none",
        transition: "box-shadow 0.2s ease",
      }}
      onMouseEnter={() => onHover?.(claim.id)}
      onMouseLeave={() => onHover?.(null)}
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
          background: isHovered ? "rgba(139, 92, 246, 0.2)" : "var(--bg-mid)",
          border: isHovered ? "1px solid rgba(139, 92, 246, 0.4)" : "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "12px", fontWeight: 700,
          color: isHovered ? "#a78bfa" : "var(--text-muted)",
          transition: "all 0.2s ease",
        }}>
          {claim.id}
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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Reasoning
                  </p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const originalText = document.getElementById("original-text-section");
                      if (originalText) {
                        originalText.scrollIntoView({ behavior: "smooth", block: "center" });
                      }
                    }}
                    style={{
                      padding: "4px 10px",
                      borderRadius: "6px",
                      background: "rgba(139, 92, 246, 0.1)",
                      border: "1px solid rgba(139, 92, 246, 0.3)",
                      color: "#a78bfa",
                      fontSize: "11px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(139, 92, 246, 0.2)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(139, 92, 246, 0.1)";
                    }}
                  >
                    ↑ View in Context
                  </button>
                </div>
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

              {/* Evidence Snippet Preview (New!) */}
              <EvidenceSnippetPreview citations={claim.result.citations} />

              {/* Quick source links */}
              {claim.result.citations.length > 0 && (
                <div>
                  <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                    Quick Links
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
