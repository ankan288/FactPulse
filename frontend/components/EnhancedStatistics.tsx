"use client";

import React, { useMemo } from "react";
import { motion } from "framer-motion";
import {
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
} from "recharts";
import type { Summary } from "@/lib/api";

interface EnhancedStatisticsProps {
  data: Summary;
}

export default function EnhancedStatistics({ data }: EnhancedStatisticsProps) {
  // Accuracy Gauge Data
  const gaugeData = [
    { name: "Accuracy", value: data.overallScore, fill: "url(#colorGauge)" },
  ];

  // Verdict Pie Chart Data
  const verdictData = [
    { name: "True", value: data.true, color: "#10b981" },
    { name: "False", value: data.false, color: "#ef4444" },
    { name: "Partial", value: data.partial, color: "#eab308" },
    { name: "Unverifiable", value: data.unverifiable, color: "#6b7280" },
  ].filter((d) => d.value > 0);

  // Fallback and Key Insights Logic
  const hasData = data.total > 0;
  
  const dominantVerdict = useMemo(() => {
    if (!hasData) return null;
    return verdictData.reduce((prev, current) =>
      prev.value > current.value ? prev : current
    );
  }, [hasData, verdictData]);

  const showWarning = hasData && (data.averageConfidence < 50 || data.false > data.true);

  if (!hasData) return null;

  return (
    <div style={{ marginTop: "32px", display: "flex", flexDirection: "column", gap: "24px", color: "white", fontFamily: "sans-serif" }}>
      
      {/* Top Row: 2 Columns */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "24px" }}>
        
        {/* Accuracy Gauge Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{ background: "rgba(20,20,30,0.6)", borderRadius: "16px", padding: "24px", border: "1px solid rgba(255,255,255,0.05)" }}
        >
          <h3 style={{ fontSize: "16px", fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: "16px" }}>Overall Accuracy</h3>
          <div style={{ height: "200px", width: "100%", position: "relative" }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                cx="50%"
                cy="50%"
                innerRadius="70%"
                outerRadius="100%"
                barSize={15}
                data={gaugeData}
                startAngle={180}
                endAngle={0}
              >
                <defs>
                  <linearGradient id="colorGauge" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#8a5cff" />
                    <stop offset="100%" stopColor="#00ffd1" />
                  </linearGradient>
                </defs>
                <PolarAngleAxis
                  type="number"
                  domain={[0, 100]}
                  angleAxisId={0}
                  tick={false}
                />
                <RadialBar
                  background={{ fill: "rgba(255,255,255,0.05)" }}
                  dataKey="value"
                  cornerRadius={10}
                />
              </RadialBarChart>
            </ResponsiveContainer>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", top: "20%" }}>
              <span style={{ fontSize: "42px", fontWeight: 800 }}>{data.overallScore}%</span>
            </div>
          </div>
        </motion.div>

        {/* Verdict Pie Chart */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          style={{ background: "rgba(20,20,30,0.6)", borderRadius: "16px", padding: "24px", border: "1px solid rgba(255,255,255,0.05)" }}
        >
          <h3 style={{ fontSize: "16px", fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: "16px" }}>Verdict Breakdown</h3>
          <div style={{ height: "200px", width: "100%" }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={verdictData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {verdictData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip 
                  contentStyle={{ background: "#1a1a24", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }}
                  itemStyle={{ color: "white" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

      </div>

      {/* Middle Row: Metric Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "24px" }}>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ background: "rgba(20,20,30,0.6)", padding: "20px", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.05)", textAlign: "center" }}>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px", marginBottom: "8px" }}>Average Confidence</p>
          <p style={{ fontSize: "28px", fontWeight: 700, color: data.averageConfidence > 75 ? "#00ffd1" : data.averageConfidence > 50 ? "#eab308" : "#ef4444" }}>
            {data.averageConfidence}%
          </p>
        </motion.div>
        
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} style={{ background: "rgba(20,20,30,0.6)", padding: "20px", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.05)", textAlign: "center" }}>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px", marginBottom: "8px" }}>Processing Time</p>
          <p style={{ fontSize: "28px", fontWeight: 700 }}>
            {data.processingTime}s
          </p>
        </motion.div>
      </div>

      {/* Confidence Histogram */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        style={{ background: "rgba(20,20,30,0.6)", borderRadius: "16px", padding: "24px", border: "1px solid rgba(255,255,255,0.05)" }}
      >
        <h3 style={{ fontSize: "16px", fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: "16px" }}>Confidence Distribution</h3>
        <div style={{ height: "250px", width: "100%" }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.confidenceDistribution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <XAxis dataKey="range" stroke="rgba(255,255,255,0.3)" fontSize={12} />
              <YAxis stroke="rgba(255,255,255,0.3)" fontSize={12} allowDecimals={false} />
              <RechartsTooltip
                cursor={{ fill: "rgba(255,255,255,0.05)" }}
                contentStyle={{ background: "#1a1a24", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }}
              />
              <Bar dataKey="count" fill="#8a5cff" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Top Sources & Key Insights */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "24px" }}>
        
        {/* Top Sources */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          style={{ background: "rgba(20,20,30,0.6)", borderRadius: "16px", padding: "24px", border: "1px solid rgba(255,255,255,0.05)" }}
        >
          <h3 style={{ fontSize: "16px", fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: "16px" }}>Top Sources Cited</h3>
          {data.topSources.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {data.topSources.map((src, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px", background: "rgba(255,255,255,0.03)", borderRadius: "8px" }}>
                  <span style={{ fontSize: "14px", color: "#e2e8f0" }}>{src.name}</span>
                  <span style={{ fontSize: "12px", background: "rgba(255,255,255,0.1)", padding: "4px 8px", borderRadius: "12px" }}>{src.count} citations</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)", fontStyle: "italic" }}>No sources cited yet.</p>
          )}
        </motion.div>

        {/* Key Insights */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          style={{ background: "rgba(20,20,30,0.6)", borderRadius: "16px", padding: "24px", border: "1px solid rgba(255,255,255,0.05)" }}
        >
          <h3 style={{ fontSize: "16px", fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: "16px" }}>Key Insights</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {dominantVerdict && (
              <p style={{ fontSize: "14px", lineHeight: "1.6", color: "#e2e8f0" }}>
                <span style={{ fontSize: "18px", marginRight: "8px" }}>📊</span> 
                The dominant verdict in this analysis is <strong style={{ color: dominantVerdict.color }}>{dominantVerdict.name}</strong>, accounting for <strong>{Math.round((dominantVerdict.value / data.total) * 100)}%</strong> of all claims.
              </p>
            )}
            <p style={{ fontSize: "14px", lineHeight: "1.6", color: "#e2e8f0" }}>
              <span style={{ fontSize: "18px", marginRight: "8px" }}>⏱</span> 
              The AI verification pipeline completed the entire analysis in real-time, taking just <strong>{data.processingTime} seconds</strong> to debate and verify.
            </p>
            {showWarning && (
              <div style={{ marginTop: "12px", padding: "12px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", color: "#fca5a5", fontSize: "14px" }}>
                <span style={{ marginRight: "6px" }}>⚠️</span> <strong>Warning:</strong> This content has low overall confidence or contains predominantly false claims. Proceed with caution.
              </div>
            )}
          </div>
        </motion.div>

      </div>
    </div>
  );
}
