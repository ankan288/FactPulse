"use client";
import { FiActivity } from "react-icons/fi";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import InputPanel from "@/components/InputPanel";
import PipelineProgress from "@/components/PipelineProgress";
import ClaimCard from "@/components/ClaimCard";
import type { Claim } from "@/components/ClaimCard";
import AccuracyReport from "@/components/AccuracyReport";
import AIDetectionBadge from "@/components/AIDetectionBadge";
import {
  streamVerify,
  type PipelineEvent,
  type ResultEvent,
  type AIDetectionEvent,
  type DoneEvent,
} from "@/lib/api";

type AppState = "input" | "running" | "done" | "error";
interface Summary { total: number; true: number; false: number; partial: number; unverifiable: number; overallScore: number; }
interface AIResult  { score: number; label: "LIKELY_HUMAN" | "AI_ASSISTED" | "LIKELY_AI"; signals: string[]; }

export default function Dashboard() {
  const router = useRouter();
  const [appState,      setAppState]      = useState<AppState>("input");

  const [inputMode,     setInputMode]     = useState<"text" | "url">("text");
  const [inputValue,    setInputValue]    = useState("");
  const [claims,        setClaims]        = useState<Claim[]>([]);
  const [currentStep,   setCurrentStep]   = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [processedCount,setProcessedCount]= useState(0);
  const [summary,       setSummary]       = useState<Summary | null>(null);
  const [aiResult,      setAiResult]      = useState<AIResult  | null>(null);
  const [errorMsg,      setErrorMsg]      = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const handleEvent = useCallback((evt: PipelineEvent) => {
    switch (evt.step) {
      case "status":
      case "extracting":
      case "detecting":
        setCurrentStep(evt.step === "extracting" ? "extracting" : evt.step === "detecting" ? "detecting" : "status");
        setStatusMessage(evt.message);
        break;
      case "claims_found":
        setStatusMessage(`Found ${evt.count} verifiable claims`);
        break;
      case "claim":
        setClaims((p) => [...p, { id: evt.id, claim: evt.claim, context: evt.context, ambiguous: evt.ambiguous, status: "pending" }]);
        break;
      case "searching":
        setCurrentStep("searching");
        setStatusMessage(`Searching: "${evt.query.slice(0, 60)}…"`);
        setClaims((p) => p.map((c) => c.id === evt.claimId ? { ...c, status: "searching" } : c));
        break;
      case "verifying":
        setCurrentStep("verifying");
        setStatusMessage("Verifying claim against evidence…");
        setClaims((p) => p.map((c) => c.id === evt.claimId ? { ...c, status: "verifying" } : c));
        break;
      case "result": {
        const r = evt as ResultEvent;
        setClaims((p) => p.map((c) => c.id === r.claimId ? { ...c, status: "done", result: { claimId: r.claimId, claim: r.claim, verdict: r.verdict, confidence: r.confidence, reasoning: r.reasoning, citations: r.citations, conflicting: r.conflicting, ruleFlags: r.ruleFlags } } : c));
        setProcessedCount((n) => n + 1);
        break;
      }
      case "ai_detection": {
        const a = evt as AIDetectionEvent;
        setAiResult({ score: a.score, label: a.label, signals: a.signals });
        break;
      }
      case "done": {
        const d = evt as DoneEvent;
        setSummary(d.summary);
        setCurrentStep("done");
        setStatusMessage("Analysis complete!");
        setAppState("done");
        break;
      }
      case "error":
        setErrorMsg(evt.message);
        setAppState("error");
        break;
    }
  }, []);

  const handleSubmit = async () => {
    if (!inputValue.trim()) return;
    abortRef.current = new AbortController();
    setAppState("running");
    setClaims([]); setSummary(null); setAiResult(null);
    setErrorMsg(""); setCurrentStep("extracting");
    setStatusMessage("Starting pipeline…"); setProcessedCount(0);
    try {
      const payload = inputMode === "text" ? { text: inputValue } : { url: inputValue };
      await streamVerify(payload, handleEvent, abortRef.current.signal);
    } catch (e: unknown) {
      if ((e as Error).name !== "AbortError") {
        setErrorMsg((e as Error).message || "Unknown error");
        setAppState("error");
      }
    }
  };

  const handleCancel = () => { abortRef.current?.abort(); setAppState("input"); };

  const handleReset = () => {
    setAppState("input");
    setClaims([]); setSummary(null); setAiResult(null);
    setErrorMsg(""); setCurrentStep(""); setInputValue("");
  };

  const isHero   = appState === "input";
  const isResult = appState === "running" || appState === "done" || appState === "error";

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", backgroundColor: "#000" }}>

      {/* ── HERO SECTION ── */}
      <motion.section
        animate={{ height: isHero ? "100vh" : "auto" }}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        style={{ minHeight: isHero ? "100vh" : 0, position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(to bottom, #050d1a 0%, #0a1122 100%)" }}
      >
        {/* Top Navbar Logo */}
        <div style={{ position: "absolute", top: 32, left: 32, zIndex: 10, display: "flex", alignItems: "center", gap: 12, color: "#fff", fontWeight: 600, fontSize: 20 }}>
          <Link href="/" style={{ textDecoration: "none", color: "inherit", display: "flex", alignItems: "center", gap: 8 }}>
            <FiActivity size={24} color="#a855f7" /> FactPulse
          </Link>
        </div>

        {/* Hero content */}
        <div style={{ position: "relative", zIndex: 2, width: "100%", maxWidth: 820, margin: "0 auto", padding: "0 24px", textAlign: "center" }}>

          <AnimatePresence mode="wait">
            {/* Input mode — InputPanel slides up */}
            {appState === "input" && (
              <motion.div key="input" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.4 }}>
                <h2 style={{ fontSize: "clamp(22px,4vw,36px)", fontWeight: 800, marginBottom: 8, background: "linear-gradient(135deg,#fff 40%,var(--accent-cyan))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  FactCheck AI
                </h2>
                <p style={{ fontSize: 14, color: "rgba(240,244,248,0.55)", marginBottom: 24 }}>
                  Paste text or a URL. We extract every verifiable claim, search live evidence, and generate an explainable accuracy report in seconds.
                </p>
                <InputPanel
                  inputMode={inputMode} setInputMode={setInputMode}
                  inputValue={inputValue} setInputValue={setInputValue}
                  onSubmit={handleSubmit}
                  isLoading={false}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Running state — show compact header in hero */}
          {appState === "running" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 6, color: "#fff" }}>Analysing…</h2>
              <p style={{ fontSize: 14, color: "rgba(240,244,248,0.5)" }}>Scroll down to see results as they arrive</p>
            </motion.div>
          )}
        </div>
      </motion.section>

      {/* ── RESULTS SECTION ── */}
      <AnimatePresence>
        {isResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ flex: 1, background: "var(--bg-deep)", paddingBottom: 80 }}
          >
            <div className="container" style={{ paddingTop: 32 }}>

              {/* Pipeline progress */}
              {appState === "running" && (
                <div style={{ marginBottom: 24 }}>
                  <PipelineProgress
                    currentStep={currentStep}
                    statusMessage={statusMessage}
                    claimCount={claims.length}
                    processedCount={processedCount}
                  />
                </div>
              )}

              {/* Error */}
              {appState === "error" && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  style={{ padding: "16px 20px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "var(--radius)", marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}
                >
                  <span style={{ fontSize: 18 }}>⚠️</span>
                  <p style={{ flex: 1, fontSize: 14, color: "#fca5a5" }}>{errorMsg}</p>
                  <button className="btn-secondary" onClick={handleReset}>Try Again</button>
                </motion.div>
              )}

              {/* Accuracy report (sticky when done) */}
              {appState === "done" && summary && (
                <motion.div style={{ position: "sticky", top: 12, zIndex: 10, marginBottom: 20 }} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                  <AccuracyReport summary={summary} />
                </motion.div>
              )}

              {/* Claim cards */}
              {claims.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
                  {claims.map((claim, i) => <ClaimCard key={claim.id} claim={claim} index={i} />)}
                </div>
              )}

              {/* AI Detection badge */}
              {aiResult && (
                <div style={{ marginBottom: 24 }}>
                  <AIDetectionBadge score={aiResult.score} label={aiResult.label} signals={aiResult.signals} />
                </div>
              )}

              {/* Reset */}
              {appState === "done" && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: "center", paddingTop: 8 }}>
                  <button className="btn-primary" onClick={handleReset}>🔄 Check Another</button>
                </motion.div>
              )}

            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </main>
  );
}
