"use client";

import { motion } from "framer-motion";

interface Props {
  score: number;
  label: "LIKELY_HUMAN" | "AI_ASSISTED" | "LIKELY_AI";
  signals: string[];
}

const META = {
  LIKELY_HUMAN: { icon: "👤", text: "Likely Human",      color: "#22c55e", desc: "This text shows strong signs of human authorship." },
  AI_ASSISTED:  { icon: "🤝", text: "AI-Assisted",       color: "#f59e0b", desc: "This text may have been partially written or edited by AI." },
  LIKELY_AI:    { icon: "🤖", text: "Likely AI-Generated", color: "#ef4444", desc: "This text shows strong signals of AI generation." },
};

export default function AIDetectionBadge({ score, label, signals }: Props) {
  const meta = META[label] ?? META.AI_ASSISTED;

  return (
    <motion.div
      className="glass"
      style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "12px" }}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <span style={{ fontSize: "24px" }}>{meta.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: 4 }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              AI Detection
            </span>
            <span style={{
              padding: "2px 10px", borderRadius: "100px",
              fontSize: "11px", fontWeight: 700,
              background: `${meta.color}18`, color: meta.color,
            }}>
              {meta.text}
            </span>
          </div>
          <p style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{meta.desc}</p>
        </div>

        {/* Score pill */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "22px", fontWeight: 800, fontFamily: "'Sora', sans-serif", color: meta.color }}>
            {score}%
          </div>
          <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>AI probability</div>
        </div>
      </div>

      {/* Score bar */}
      <div className="progress-bar">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={{ height: "100%", borderRadius: 4, background: meta.color }}
        />
      </div>

      {/* Signals */}
      {signals.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {signals.map((s, i) => (
            <span key={i} style={{
              padding: "3px 10px", borderRadius: 6,
              background: "rgba(0,0,0,0.3)", border: "1px solid var(--border)",
              fontSize: "11px", color: "var(--text-secondary)",
            }}>
              {s}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}
