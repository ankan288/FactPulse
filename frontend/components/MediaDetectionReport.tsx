"use client";

import { motion } from "framer-motion";
import type { MediaReport } from "@/lib/api";

interface Props {
  reports: MediaReport[];
}

export default function MediaDetectionReport({ reports }: Props) {
  if (!reports || reports.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h3 style={{ fontSize: 16, color: "var(--text-primary)", fontWeight: 600, fontFamily: "'Sora', sans-serif" }}>
        Media Detection Analysis
      </h3>
      
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        {reports.map((report, idx) => {
          const isAI = report.label === "LIKELY_AI_GENERATED" || report.ai_probability > 70;
          const labelColor = isAI ? "#ef4444" : report.label === "AI_ASSISTED" ? "#f59e0b" : "#10b981";
          const labelText = isAI ? "High AI Probability" : report.label === "AI_ASSISTED" ? "Possible AI Edits" : "Likely Authentic";
          
          return (
            <motion.div
              key={idx}
              className="glass"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.1 }}
              style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div style={{
                position: "relative",
                width: "100%",
                height: 160,
                borderRadius: 8,
                overflow: "hidden",
                background: "#0f172a"
              }}>
                <img 
                  src={report.url} 
                  alt={report.caption}
                  style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.9 }}
                />
                
                <div style={{
                  position: "absolute",
                  top: 8, right: 8,
                  background: "rgba(0,0,0,0.75)",
                  backdropFilter: "blur(4px)",
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: `1px solid ${labelColor}40`,
                  display: "flex", alignItems: "center", gap: 6,
                  fontSize: 12, fontWeight: 700, color: labelColor
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: labelColor }} />
                  {labelText} ({report.ai_probability}%)
                </div>
              </div>
              
              <div>
                {report.caption && (
                  <p style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500, marginBottom: 4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {report.caption}
                  </p>
                )}
                <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  {report.reasoning}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
