"use client";

import { motion } from "framer-motion";

const STEPS = [
  { id: "extracting", label: "Extracting claims" },
  { id: "searching", label: "Searching evidence" },
  { id: "verifying", label: "Cross-checking sources" },
  { id: "detecting", label: "Scanning AI writing signals" },
  { id: "media_detecting", label: "Scanning image authenticity" },
  { id: "done", label: "Generating verification report" },
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

  return (
    <motion.div
      style={{
        padding: "0px",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
      }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ fontSize: 13, color: "rgba(228,232,240,0.82)", fontWeight: 600, letterSpacing: "0.01em" }}>
          Pipeline Activity
        </p>
        {claimCount > 0 && currentStep !== "done" && (
          <p style={{ fontSize: 12, color: "rgba(161,169,183,0.9)" }}>
            {processedCount}/{claimCount}
          </p>
        )}
      </div>

      <div
        style={{
          borderRadius: 0,
          padding: "0px",
          background: "transparent",
          border: "none",
          boxShadow: "none",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {STEPS.map((step, i) => {
            const isVisible = i <= activeIndex || currentStep === "done";
            const isActive = i === activeIndex && currentStep !== "done";
            const isDone = i < activeIndex || currentStep === "done";

            return (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: isVisible ? 1 : 0.28, x: 0 }}
                transition={{ duration: 0.28, delay: i * 0.03 }}
                style={{
                  position: "relative",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 14,
                  lineHeight: 1.35,
                  padding: isActive ? "3px 8px" : "0px",
                  borderRadius: isActive ? 8 : 0,
                  background: isActive ? "linear-gradient(90deg, rgba(34,211,238,0.10), rgba(34,211,238,0.03), rgba(34,211,238,0.10))" : "transparent",
                  color: isActive ? "#f1f5f9" : isDone ? "rgba(229,236,245,0.82)" : "rgba(145,155,172,0.42)",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
                }}
              >
                {isActive && <span className="pipeline-flow-beam" />}
                <span style={{ color: isActive ? "#22d3ee" : "rgba(163,172,189,0.65)", width: 12 }}>
                  {isDone ? "✓" : ">"}
                </span>
                <span className={isActive ? "pipeline-active-label" : undefined}>{step.label}</span>
                {isActive && <span className="pipeline-ellipsis" />}
              </motion.div>
            );
          })}
        </div>
      </div>

      <p style={{ fontSize: "13px", color: "rgba(176,186,201,0.88)" }}>
        {statusMessage}
      </p>

      <style>{`
        .pipeline-flow-beam {
          position: absolute;
          top: 0;
          left: -40%;
          width: 40%;
          height: 100%;
          pointer-events: none;
          background: linear-gradient(90deg, transparent 0%, rgba(103,232,249,0.12) 45%, rgba(103,232,249,0.28) 50%, rgba(103,232,249,0.12) 55%, transparent 100%);
          filter: blur(0.3px);
          animation: pipelineFlow 1.6s linear infinite;
        }
        .pipeline-active-label {
          background: linear-gradient(90deg, #dffaff 0%, #ffffff 35%, #8be9ff 55%, #ffffff 75%, #dffaff 100%);
          background-size: 220% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: pipelineTextFlow 2.1s ease-in-out infinite;
        }
        .pipeline-ellipsis::after {
          content: '...';
          display: inline-block;
          width: 16px;
          overflow: hidden;
          vertical-align: bottom;
          animation: pipelineDots 1.1s steps(4, end) infinite;
          color: #67e8f9;
        }
        @keyframes pipelineDots {
          0% { width: 0; }
          100% { width: 16px; }
        }
        @keyframes pipelineFlow {
          0% { left: -40%; }
          100% { left: 105%; }
        }
        @keyframes pipelineTextFlow {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
    </motion.div>
  );
}
