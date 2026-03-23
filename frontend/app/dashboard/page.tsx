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
import OriginalText from "@/components/OriginalText";
import AccuracyReport from "@/components/AccuracyReport";
import AIDetectionBadge from "@/components/AIDetectionBadge";
import MediaDetectionReport from "@/components/MediaDetectionReport";
import ProfileDropdown from "@/components/ProfileDropdown";
import ColorBends from "@/components/ColorBends";
import {
  streamVerify,
  type PipelineEvent,
  type ResultEvent,
  type AIDetectionEvent,
  type DoneEvent,
  type MediaReport,
  type FusionReport,
} from "@/lib/api";

type AppState = "input" | "running" | "done" | "error";
interface Summary { total: number; true: number; false: number; partial: number; unverifiable: number; overallScore: number; }
interface AIResult  { score: number; label: "LIKELY_HUMAN" | "AI_ASSISTED" | "LIKELY_AI"; signals: string[]; }

export default function Dashboard() {
  const router = useRouter();
  const [appState,      setAppState]      = useState<AppState>("input");

  const [inputMode,     setInputMode]     = useState<"text" | "url">("text");
  const [inputValue,    setInputValue]    = useState("");
  const [selectedFile,  setSelectedFile]  = useState<File | null>(null);
  const [claims,        setClaims]        = useState<Claim[]>([]);
  const [currentStep,   setCurrentStep]   = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [processedCount,setProcessedCount]= useState(0);
  const [summary,       setSummary]       = useState<Summary | null>(null);
  const [aiResult,      setAiResult]      = useState<AIResult  | null>(null);
  const [mediaReports,  setMediaReports]  = useState<MediaReport[]>([]);
  const [fusionReport,  setFusionReport]  = useState<FusionReport | null>(null);
  const [errorMsg,      setErrorMsg]      = useState("");
  const [originalText,  setOriginalText]  = useState("");
  const [hoveredClaimId, setHoveredClaimId] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleEvent = useCallback((evt: PipelineEvent) => {
    switch (evt.step) {
      case "status":
      case "extracting":
      case "detecting":
      case "media_detecting":
        setCurrentStep(evt.step === "extracting" ? "extracting" : evt.step === "detecting" ? "detecting" : evt.step === "media_detecting" ? "media_detecting" : "status");
        setStatusMessage(evt.message);
        break;
      case "text_extracted":
        setOriginalText(evt.text);
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
      case "media_results":
        if ("reports" in evt) {
          setMediaReports(evt.reports);
        }
        break;
      case "done": {
        const d = evt as DoneEvent;
        setSummary(d.summary);
        setFusionReport(d.fusion);
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
    if (!inputValue.trim() && !selectedFile) return;
    abortRef.current = new AbortController();
    setAppState("running");
    setClaims([]); setSummary(null); setAiResult(null); setMediaReports([]); setFusionReport(null);
    setErrorMsg(""); setCurrentStep("extracting");
    setStatusMessage("Starting pipeline…"); setProcessedCount(0);
    try {
      let payload: any;
      if (selectedFile) {
        // For file uploads (image, video, audio)
        payload = new FormData();
        payload.append("file", selectedFile);
        payload.append("type", inputMode); // image, video, or audio
      } else {
        // Auto-detect: if value starts with http/https/www treat as URL
        const isUrl = /^https?:\/\/|^www\./i.test(inputValue.trim());
        payload = isUrl ? { url: inputValue.trim() } : { text: inputValue };
        // Store original text for direct text input (URL text will come from backend)
        if (!isUrl) {
          setOriginalText(inputValue);
        }
      }
      await streamVerify(payload, handleEvent, abortRef.current.signal);
    } catch (e: unknown) {
      if ((e as Error).name !== "AbortError") {
        setErrorMsg((e as Error).message || "Unknown error");
        setAppState("error");
      } setSelectedFile(null);
    }
  };

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
  };

  const handleCancel = () => { abortRef.current?.abort(); setAppState("input"); };

  const handleReset = () => {
    setAppState("input");
    setClaims([]); setSummary(null); setAiResult(null); setMediaReports([]); setFusionReport(null);
    setErrorMsg(""); setCurrentStep(""); setInputValue(""); setOriginalText("");
    setHoveredClaimId(null);
  };

  const isHero   = appState === "input";
  const isResult = appState === "running" || appState === "done" || appState === "error";
  const colorBendsProps = {
    colors: ["#ff5c7a", "#8a5cff", "#00ffd1"],
    rotation: 0,
    speed: 0.2,
    scale: 1,
    frequency: 1,
    warpStrength: 1,
    mouseInfluence: 1,
    parallax: 0.5,
    noise: 0.1,
    transparent: true,
    autoRotate: 0,
  };

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", backgroundColor: "#000" }}>

      {/* ── HERO SECTION ── */}
      <motion.section
        animate={{ height: isHero ? "100vh" : isResult ? "auto" : "100vh" }}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        style={{ 
          minHeight: isHero ? "100vh" : "auto",
          position: "relative", 
          overflow: "hidden", 
          display: "flex", 
          alignItems: "center",
          justifyContent: "center", 
          background: "linear-gradient(to bottom, #050312 0%, #07061a 45%, #03040d 100%)",
          paddingTop: isResult ? 32 : 0,
        }}
      >
        <div style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none" }}>
          <ColorBends {...colorBendsProps} />
        </div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            pointerEvents: "none",
            background:
              "radial-gradient(circle at 50% 44%, rgba(40,40,90,0.08) 0%, rgba(6,6,20,0.34) 58%, rgba(3,3,12,0.64) 100%)",
          }}
        />

        {/* Top Navbar Logo */}
        <div style={{ position: "absolute", top: 32, left: 32, zIndex: 10, display: "flex", alignItems: "center", gap: 12, color: "#fff", fontWeight: 600, fontSize: 20 }}>
          <Link href="/" style={{ textDecoration: "none", color: "inherit", display: "flex", alignItems: "center", gap: 8 }}>
            <FiActivity size={24} color="#a855f7" /> FactPulse
          </Link>
        </div>

        {/* Profile Dropdown - Top Right */}
        <div style={{ position: "absolute", top: 32, right: 32, zIndex: 10 }}>
          <ProfileDropdown username="John Doe" email="john@example.com" />
        </div>

        {/* Hero content */}
        {isHero && (
          <div style={{ position: "relative", zIndex: 2, width: "100%", maxWidth: 820, margin: "0 auto", padding: "0 24px", textAlign: "center" }}>
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              <h2 style={{ fontSize: "clamp(22px,4vw,36px)", fontWeight: 800, marginBottom: 8, background: "linear-gradient(135deg,#fff 40%,var(--accent-cyan))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                FactPulse AI
              </h2>
              <p style={{ fontSize: 14, color: "rgba(240,244,248,0.55)", marginBottom: 24 }}>
                Paste. Verify. Trust the evidence.
              </p>
            </motion.div>
          </div>
        )}

        {/* Running/Done state header */}
        {isResult && (
          <div style={{ position: "relative", zIndex: 2, width: "100%", textAlign: "center" }}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4, color: "#fff" }}>
                {appState === "running" ? "Analysing Your Content" : "Analysis Complete"}
              </h2>
              <p style={{ fontSize: 13, color: "rgba(240,244,248,0.5)" }}>
                {appState === "running" ? "Results appear in real-time below" : "Review the findings below or analyze another item"}
              </p>
            </motion.div>
          </div>
        )}

        {/* Fixed bottom-left compact input panel (input screen only) */}
        {isHero && (
          <InputPanel
            inputMode={inputMode}
            setInputMode={setInputMode}
            inputValue={inputValue}
            setInputValue={setInputValue}
            onSubmit={handleSubmit}
            isLoading={false}
            onCancel={undefined}
            isCompactMode={true}
            compactStyle={{
              left: "35%",
              bottom: "auto",
              top: "64%",
              transform: "none",
              maxWidth: 620,
              width: "min(94vw, 620px)",
            }}
            onFileSelect={handleFileSelect}
          />
        )}
      </motion.section>

      {/* ── RESULTS SECTION ── */}
      <AnimatePresence>
        {isResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              flex: 1,
              background: "linear-gradient(180deg, #050312 0%, #03040d 100%)",
              paddingBottom: 24,
              paddingRight: 24,
              paddingLeft: 24,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
              <ColorBends {...colorBendsProps} />
            </div>
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 0,
                pointerEvents: "none",
                background:
                  "radial-gradient(circle at 35% 20%, rgba(18,16,44,0.14), rgba(5,6,18,0.42) 58%, rgba(2,3,10,0.7) 100%)",
              }}
            />
            <div className="container" style={{ paddingTop: 24, maxWidth: 900, margin: "0 auto", position: "relative", zIndex: 2 }}>

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
                  <AccuracyReport summary={summary} fusion={fusionReport || undefined} />
                </motion.div>
              )}

              {/* Original text with highlighted claims */}
              {originalText && claims.length > 0 && (
                <OriginalText
                  originalText={originalText}
                  claims={claims.map(c => ({
                    id: c.id,
                    claim: c.claim,
                    context: c.context,
                    verdict: c.result?.verdict,
                    confidence: c.result?.confidence,
                  }))}
                  hoveredClaimId={hoveredClaimId}
                  onClaimHover={setHoveredClaimId}
                />
              )}

              {/* Media report */}
              {mediaReports.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <MediaDetectionReport reports={mediaReports} />
                </div>
              )}

              {/* Claim cards */}
              {claims.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
                  {claims.map((claim, i) => (
                    <ClaimCard
                      key={claim.id}
                      claim={claim}
                      index={i}
                      isHovered={hoveredClaimId === claim.id}
                      onHover={setHoveredClaimId}
                    />
                  ))}
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
