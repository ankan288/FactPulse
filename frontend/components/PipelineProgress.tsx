"use client";

import { motion } from "framer-motion";

const STEPS = [
  { id: "extracting", label: "Extract Claims", icon: "🧠" },
  { id: "searching",  label: "Search Evidence", icon: "🔍" },
  { id: "verifying",  label: "Verify Claims",   icon: "⚖️" },
  { id: "detecting",  label: "AI Detection",    icon: "🤖" },
  { id: "done",       label: "Report Ready",    icon: "✅" },
];

interface Props {
  currentStep: string;
  statusMessage: string;
  claimCount: number;
  processedCount: number;
}

export default function PipelineProgress({ currentStep, statusMessage, claimCount, processedCount }: Props) {
  const stepIndex = STEPS.findIndex((s) => s.id === currentStep);
  const activeIndex = stepIndex === -1 ? 0 : stepIndex;
  const progress = claimCount > 0
    ? Math.round((processedCount / claimCount) * 100)
    : activeIndex >= 1 ? 30 : 5;

  return (
    <motion.div
      className="glass"
      style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: "16px" }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Step pills */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {STEPS.map((step, i) => {
          const isDone = i < activeIndex || currentStep === "done";
          const isActive = i === activeIndex && currentStep !== "done";
          return (
            <div
              key={step.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 14px",
                borderRadius: "100px",
                fontSize: "12px",
                fontWeight: 600,
                border: "1px solid",
                transition: "all 0.3s",
                borderColor: isActive ? "var(--accent-cyan)" : isDone ? "var(--accent-violet)" : "var(--border)",
                background: isActive ? "var(--accent-cyan-dim)" : isDone ? "var(--accent-violet-dim)" : "transparent",
                color: isActive ? "var(--accent-cyan)" : isDone ? "#a78bfa" : "var(--text-muted)",
              }}
            >
              <span>{step.icon}</span>
              <span>{step.label}</span>
              {isActive && (
                <span style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: "var(--accent-cyan)",
                  animation: "pulse 1.2s infinite",
                }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="progress-bar">
        <motion.div
          className="progress-fill"
          animate={{ width: `${currentStep === "done" ? 100 : progress}%` }}
          transition={{ duration: 0.5 }}
          style={{ width: "0%" }}
        />
      </div>

      {/* Status message */}
      <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
        {statusMessage}
        {claimCount > 0 && currentStep !== "done" && (
          <span style={{ color: "var(--text-muted)", marginLeft: 8 }}>
            ({processedCount}/{claimCount} claims)
          </span>
        )}
      </p>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </motion.div>
  );
}
