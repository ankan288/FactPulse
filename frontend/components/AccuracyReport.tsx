"use client";

import { motion } from "framer-motion";

interface Summary {
  total: number;
  true: number;
  false: number;
  partial: number;
  unverifiable: number;
  overallScore: number;
}

interface Props { summary: Summary; }

export default function AccuracyReport({ summary }: Props) {
  const segments = [
    { key: "true",        label: "True",           color: "#22c55e", value: summary.true },
    { key: "false",       label: "False",           color: "#ef4444", value: summary.false },
    { key: "partial",     label: "Partially True",  color: "#f59e0b", value: summary.partial },
    { key: "unverifiable",label: "Unverifiable",    color: "#94a3b8", value: summary.unverifiable },
  ];

  const scoreColor =
    summary.overallScore >= 75 ? "#22c55e" :
    summary.overallScore >= 45 ? "#f59e0b" : "#ef4444";

  const scoreLabel =
    summary.overallScore >= 75 ? "Highly Accurate" :
    summary.overallScore >= 45 ? "Partially Accurate" : "Mostly Inaccurate";

  // Simple bar chart representation
  return (
    <motion.div
      className="glass"
      style={{ padding: "28px", display: "flex", flexDirection: "column", gap: "20px" }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Title row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h2 style={{ fontSize: "18px", fontFamily: "'Sora', sans-serif", color: "var(--text-primary)", marginBottom: 4 }}>
            Accuracy Report
          </h2>
          <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
            {summary.total} claims analysed
          </p>
        </div>

        {/* Overall score */}
        <div style={{ textAlign: "center" }}>
          <div style={{
            fontSize: "36px", fontWeight: 800, fontFamily: "'Sora', sans-serif",
            color: scoreColor, lineHeight: 1,
          }}>
            {summary.overallScore}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: 4 }}>{scoreLabel}</div>
        </div>
      </div>

      {/* Stacked bar */}
      <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", height: 12 }}>
        {segments.filter(s => s.value > 0).map((s) => (
          <motion.div
            key={s.key}
            title={`${s.label}: ${s.value}`}
            initial={{ width: 0 }}
            animate={{ width: `${(s.value / summary.total) * 100}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            style={{ background: s.color, height: "100%" }}
          />
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
        {segments.map((s) => (
          <div key={s.key} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: s.color }} />
            <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
              {s.label}
            </span>
            <span style={{
              fontSize: "13px", fontWeight: 700,
              color: s.value > 0 ? s.color : "var(--text-muted)",
            }}>
              {s.value}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
