"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState, useMemo, useCallback } from "react";

interface Claim {
  id: number;
  claim: string;
  context?: string;
  verdict?: "TRUE" | "FALSE" | "PARTIALLY_TRUE" | "UNVERIFIABLE";
  confidence?: number;
  evidence?: Array<{ title: string; snippet: string; url: string }>;
}

interface OriginalTextProps {
  originalText: string;
  claims: Claim[];
  hoveredClaimId?: number | null;
  onClaimHover?: (id: number | null) => void;
}

// Fuzzy matching: find the best matching substring in original text for a claim
function findBestMatch(text: string, claim: string): { start: number; end: number; score: number } | null {
  const textLower = text.toLowerCase();
  const claimLower = claim.toLowerCase().trim();

  // Exact match first
  const exactIndex = textLower.indexOf(claimLower);
  if (exactIndex !== -1) {
    return { start: exactIndex, end: exactIndex + claimLower.length, score: 1.0 };
  }

  // Extract significant words (4+ chars, not common words)
  const stopWords = new Set(["the", "and", "that", "this", "with", "from", "have", "been", "were", "are", "was", "for", "not", "but", "they", "which", "their", "will", "would", "could", "should", "about", "into", "more", "some", "than", "them", "then", "only", "also", "just", "over", "such", "after", "most", "other"]);

  const claimWords = claimLower
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length >= 4 && !stopWords.has(w));

  if (claimWords.length === 0) return null;

  // Find a region in the text with the most claim words
  const sentences = text.split(/(?<=[.!?])\s+/);
  let bestMatch: { start: number; end: number; score: number } | null = null;
  let currentPos = 0;

  for (const sentence of sentences) {
    const sentenceLower = sentence.toLowerCase();
    let matchCount = 0;

    for (const word of claimWords) {
      if (sentenceLower.includes(word)) {
        matchCount++;
      }
    }

    const score = matchCount / claimWords.length;

    // Require at least 40% word match
    if (score >= 0.4 && (!bestMatch || score > bestMatch.score)) {
      const sentenceStart = text.indexOf(sentence, currentPos);
      if (sentenceStart !== -1) {
        bestMatch = {
          start: sentenceStart,
          end: sentenceStart + sentence.length,
          score,
        };
      }
    }

    currentPos += sentence.length + 1;
  }

  return bestMatch;
}

export default function OriginalText({
  originalText,
  claims,
  hoveredClaimId = null,
  onClaimHover
}: OriginalTextProps) {
  const [expanded, setExpanded] = useState(false);
  const [localHoveredId, setLocalHoveredId] = useState<number | null>(null);

  const activeHoveredId = hoveredClaimId ?? localHoveredId;

  // Function to get verdict color
  const getVerdictColor = useCallback((verdict?: string) => {
    switch (verdict) {
      case "TRUE":
        return { bg: "rgba(34, 197, 94, 0.15)", border: "rgba(34, 197, 94, 0.4)", text: "#86efac" };
      case "FALSE":
        return { bg: "rgba(239, 68, 68, 0.15)", border: "rgba(239, 68, 68, 0.4)", text: "#fca5a5" };
      case "PARTIALLY_TRUE":
        return { bg: "rgba(245, 158, 11, 0.15)", border: "rgba(245, 158, 11, 0.4)", text: "#fcd34d" };
      case "UNVERIFIABLE":
        return { bg: "rgba(156, 163, 175, 0.15)", border: "rgba(156, 163, 175, 0.4)", text: "#d1d5db" };
      default:
        return { bg: "rgba(139, 92, 246, 0.15)", border: "rgba(139, 92, 246, 0.4)", text: "#c4b5fd" };
    }
  }, []);

  // Compute highlight regions with fuzzy matching
  const highlightedSegments = useMemo(() => {
    if (!claims || claims.length === 0) return [{ type: "text" as const, content: originalText }];

    const matches: Array<{ start: number; end: number; claim: Claim }> = [];

    // Find all claim positions in the text
    for (const claim of claims) {
      const match = findBestMatch(originalText, claim.claim);
      if (match) {
        // Check for overlaps with existing matches
        const overlaps = matches.some(m =>
          (match.start >= m.start && match.start < m.end) ||
          (match.end > m.start && match.end <= m.end) ||
          (match.start <= m.start && match.end >= m.end)
        );

        if (!overlaps) {
          matches.push({ start: match.start, end: match.end, claim });
        }
      }
    }

    // Sort by start position
    matches.sort((a, b) => a.start - b.start);

    // Build segments
    const segments: Array<
      | { type: "text"; content: string }
      | { type: "highlight"; content: string; claim: Claim }
    > = [];

    let lastEnd = 0;
    for (const match of matches) {
      if (match.start > lastEnd) {
        segments.push({ type: "text", content: originalText.slice(lastEnd, match.start) });
      }
      segments.push({
        type: "highlight",
        content: originalText.slice(match.start, match.end),
        claim: match.claim
      });
      lastEnd = match.end;
    }

    if (lastEnd < originalText.length) {
      segments.push({ type: "text", content: originalText.slice(lastEnd) });
    }

    return segments;
  }, [originalText, claims]);

  const handleClaimClick = (claimId: number) => {
    // Scroll to the corresponding claim card
    const claimCard = document.getElementById(`claim-${claimId}`);
    if (claimCard) {
      claimCard.scrollIntoView({ behavior: "smooth", block: "center" });
      // Flash the card
      claimCard.classList.add("flash-highlight");
      setTimeout(() => claimCard.classList.remove("flash-highlight"), 1000);
    }
  };

  const handleMouseEnter = (claimId: number) => {
    setLocalHoveredId(claimId);
    onClaimHover?.(claimId);
  };

  const handleMouseLeave = () => {
    setLocalHoveredId(null);
    onClaimHover?.(null);
  };

  // Preview mode shows first 500 chars
  const needsExpansion = originalText.length > 500;

  return (
    <motion.div
      id="original-text-section"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-6"
    >
      <div
        className="glass"
        style={{
          padding: "24px",
          borderRadius: "16px",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          background: "rgba(255, 255, 255, 0.02)",
          backdropFilter: "blur(12px)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              background: "rgba(139, 92, 246, 0.1)",
              border: "1px solid rgba(139, 92, 246, 0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <svg
                style={{ width: "20px", height: "20px", color: "#a78bfa" }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <div>
              <h3 style={{ color: "#fff", fontWeight: 600, fontSize: "16px", margin: 0 }}>Original Text</h3>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px", margin: "2px 0 0" }}>
                {claims.length} claim{claims.length !== 1 ? "s" : ""} highlighted
              </p>
            </div>
          </div>

          {needsExpansion && (
            <button
              onClick={() => setExpanded(!expanded)}
              style={{
                padding: "6px 14px",
                borderRadius: "8px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.7)",
                fontSize: "13px",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.05)";
              }}
            >
              {expanded ? "Show Less" : "Show Full Text"}
            </button>
          )}
        </div>

        {/* Legend */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          marginBottom: "16px",
          paddingBottom: "16px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          flexWrap: "wrap",
        }}>
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Legend:</span>
          {[
            { label: "True", color: "#22c55e" },
            { label: "False", color: "#ef4444" },
            { label: "Partial", color: "#f59e0b" },
            { label: "Unverifiable", color: "#9ca3af" },
          ].map(({ label, color }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{ width: "10px", height: "10px", borderRadius: "3px", background: `${color}40`, border: `1px solid ${color}70` }} />
              <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "12px" }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Text Content */}
        <div style={{ position: "relative" }}>
          <div
            style={{
              color: "rgba(255,255,255,0.8)",
              lineHeight: 1.8,
              fontSize: "14px",
              maxHeight: !expanded && needsExpansion ? "200px" : "none",
              overflow: "hidden",
            }}
          >
            {highlightedSegments.map((segment, i) => {
              if (segment.type === "text") {
                return <span key={i}>{segment.content}</span>;
              }

              const colors = getVerdictColor(segment.claim.verdict);
              const isHovered = activeHoveredId === segment.claim.id;

              return (
                <div key={i} style={{ display: "inline-block", position: "relative" }}>
                  <mark
                    onClick={() => handleClaimClick(segment.claim.id)}
                    onMouseEnter={() => handleMouseEnter(segment.claim.id)}
                    onMouseLeave={handleMouseLeave}
                    style={{
                      display: "inline",
                      padding: "2px 6px",
                      margin: "0 1px",
                      borderRadius: "4px",
                      background: colors.bg,
                      border: `1px solid ${colors.border}`,
                      color: colors.text,
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      boxShadow: isHovered ? `0 0 0 2px ${colors.border}` : "none",
                      transform: isHovered ? "scale(1.02)" : "none",
                    }}
                    title={`Claim #${segment.claim.id}: ${segment.claim.verdict || "Pending"} (${segment.claim.confidence || 0}%)`}
                    role="button"
                    tabIndex={0}
                    aria-label={`Claim: ${segment.claim.claim}. Verdict: ${segment.claim.verdict}. Confidence: ${segment.claim.confidence}%`}
                  >
                    {segment.content}
                    <sup style={{ fontSize: "10px", marginLeft: "2px", opacity: 0.7 }}>
                      [{segment.claim.id}]
                    </sup>
                  </mark>

                  {/* Evidence Tooltip on Hover */}
                  <AnimatePresence>
                    {isHovered && (
                      <motion.div
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: -110, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        style={{
                          position: "absolute",
                          bottom: "100%",
                          left: "50%",
                          transform: "translateX(-50%)",
                          zIndex: 50,
                          pointerEvents: "none",
                        }}
                      >
                        <div
                          style={{
                            background: `linear-gradient(135deg, rgba(0,0,0,0.95) 0%, rgba(20,20,40,0.95) 100%)`,
                            border: `1px solid ${colors.border}`,
                            borderRadius: "8px",
                            padding: "12px",
                            minWidth: "280px",
                            maxWidth: "380px",
                            boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 12px ${colors.border}40`,
                            backdropFilter: "blur(10px)",
                          }}
                        >
                          {/* Verdict Badge */}
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                            <span style={{ color: colors.text, fontWeight: 700, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                              {segment.claim.verdict?.replace(/_/g, " ") || "PENDING"}
                            </span>
                            <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "12px" }}>
                              {segment.claim.confidence}% confident
                            </span>
                          </div>

                          {/* Claim */}
                          <p style={{
                            color: "rgba(255,255,255,0.9)",
                            fontSize: "12px",
                            margin: "0 0 8px 0",
                            lineHeight: 1.4,
                            fontWeight: 500,
                          }}>
                            {segment.claim.claim}
                          </p>

                          {/* Evidence Snippets */}
                          {segment.claim.evidence && segment.claim.evidence.length > 0 && (
                            <>
                              <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", marginBottom: "6px", letterSpacing: "0.05em" }}>
                                Evidence:
                              </div>
                              {segment.claim.evidence.slice(0, 2).map((evid, idx) => (
                                <div key={idx} style={{ marginBottom: "6px", paddingBottom: "6px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                                  <a
                                    href={evid.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                      color: colors.text,
                                      fontSize: "11px",
                                      fontWeight: 600,
                                      textDecoration: "none",
                                      display: "block",
                                      marginBottom: "2px",
                                      transition: "opacity 0.15s",
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.opacity = "0.7"}
                                    onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
                                  >
                                    {evid.title.length > 45 ? evid.title.substring(0, 45) + "..." : evid.title}
                                  </a>
                                  <p style={{
                                    color: "rgba(255,255,255,0.5)",
                                    fontSize: "10px",
                                    margin: "2px 0",
                                    lineHeight: 1.3,
                                    fontStyle: "italic",
                                  }}>
                                    "{evid.snippet.length > 80 ? evid.snippet.substring(0, 80) + "..." : evid.snippet}"
                                  </p>
                                </div>
                              ))}
                            </>
                          )}

                          {/* Arrow pointing down */}
                          <div
                            style={{
                              position: "absolute",
                              bottom: "-6px",
                              left: "50%",
                              width: "12px",
                              height: "12px",
                              background: `rgba(0,0,0,0.95)`,
                              border: `1px solid ${colors.border}`,
                              borderTop: "none",
                              borderLeft: "none",
                              transform: "translateX(-50%) rotate(45deg)",
                            }}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>

          {!expanded && needsExpansion && (
            <div style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: "80px",
              background: "linear-gradient(to top, rgba(5, 13, 26, 1) 0%, transparent 100%)",
              pointerEvents: "none",
            }} />
          )}
        </div>

        {/* Hint */}
        <p style={{
          color: "rgba(255,255,255,0.4)",
          fontSize: "12px",
          marginTop: "16px",
          fontStyle: "italic"
        }}>
          Click on highlighted claims to jump to their verification results
        </p>
      </div>

      <style jsx global>{`
        @keyframes flash {
          0%, 100% { background-color: rgba(124, 58, 237, 0.1); }
          50% { background-color: rgba(124, 58, 237, 0.3); }
        }
        .flash-highlight {
          animation: flash 1s ease;
        }
      `}</style>
    </motion.div>
  );
}
