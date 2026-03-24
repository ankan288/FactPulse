"use client";
import { useState } from "react";
import { FiActivity } from "react-icons/fi";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";

// Dynamic import — avoids SSR issues with WebGL/canvas
const Beams = dynamic(() => import("@/components/Beams"), { ssr: false });

export default function Home() {
  const router = useRouter();
  const [homeHover, setHomeHover] = useState(false);
  const [docsHover, setDocsHover] = useState(false);
  const [ctaHover, setCtaHover] = useState(false);
  const [learnMoreHover, setLearnMoreHover] = useState(false);

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      {/* ── HERO SECTION with Beams background ── */}
      <motion.section
        animate={{ height: "100vh" }}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        style={{ minHeight: "100vh", position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        {/* Beams background */}
        <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
          <Beams
            beamWidth={3}
            beamHeight={30}
            beamNumber={20}
            lightColor="#ffffff"
            speed={2}
            noiseIntensity={1.75}
            scale={0.2}
            rotation={30}
          />
        </div>

        {/* Dark gradient overlay so text is legible */}
        <div style={{ position: "absolute", inset: 0, zIndex: 1, background: "linear-gradient(to bottom, rgba(5,13,26,0.55) 0%, rgba(5,13,26,0.35) 50%, rgba(5,13,26,0.75) 100%)" }} />

        {/* Top Navbar Pill (positioned relative to the full-screen section) */}
        <div style={{ position: "absolute", top: 24, left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 30, padding: "0 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(10, 10, 15, 0.4)", backdropFilter: "blur(12px)", padding: "16px 32px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.08)", width: "100%", maxWidth: 1200 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, color: "#fff", fontWeight: 600, fontSize: 18, letterSpacing: "-0.5px" }}>
              <FiActivity size={24} style={{ color: "#fff" }} /> FactPulse
            </div>
            <div style={{ display: "flex", gap: 32, fontSize: 15, fontWeight: 500 }}>
              <Link href="/dashboard" style={{ textDecoration: "none" }}>
                <span style={{ cursor: "pointer", transition: "color 0.2s", color: homeHover ? "#fff" : "rgba(255,255,255,0.7)" }} onMouseEnter={() => setHomeHover(true)} onMouseLeave={() => setHomeHover(false)}>Home</span>
              </Link>
              <span style={{ cursor: "pointer", transition: "color 0.2s", color: docsHover ? "#fff" : "rgba(255,255,255,0.7)" }} onMouseEnter={() => setDocsHover(true)} onMouseLeave={() => setDocsHover(false)}>Docs</span>
            </div>
          </div>
        </div>

        {/* Hero content */}
        <div style={{ position: "relative", zIndex: 2, width: "100%", maxWidth: 820, margin: "0 auto", padding: "0 24px", textAlign: "center" }}>

          <AnimatePresence mode="wait">
            <motion.div
              key="landing" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.5 }}>

              <h1 style={{ fontSize: "clamp(36px, 5vw, 54px)", fontWeight: 700, lineHeight: 1.15, color: "#fff", letterSpacing: "-1.5px", maxWidth: 700, margin: "0 auto 32px" }}>
                Where every claim<br />
                meets evidence.
              </h1>

              {/* Desktop Buttons */}
              <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", position: "relative", zIndex: 10 }}>
                <button
                  onClick={() => router.push("/signin")}
                  style={{ 
                    background: "#fff", 
                    color: "#000", 
                    padding: "16px 36px", 
                    borderRadius: 999, 
                    fontSize: 16, 
                    fontWeight: 600, 
                    border: "none", 
                    cursor: "pointer", 
                    transition: "transform 0.2s",
                    transform: ctaHover ? "scale(1.05)" : "scale(1)"
                  }}
                  onMouseEnter={() => setCtaHover(true)}
                  onMouseLeave={() => setCtaHover(false)}
                >
                  Get Started
                </button>

                <a
                  href="http://localhost:8000/docs"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ 
                    display: "inline-block", 
                    background: learnMoreHover ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)", 
                    color: learnMoreHover ? "#fff" : "rgba(255,255,255,0.7)", 
                    padding: "16px 36px", 
                    borderRadius: 999, 
                    fontSize: 16, 
                    fontWeight: 600, 
                    border: "1px solid rgba(255,255,255,0.1)", 
                    cursor: "pointer", 
                    backdropFilter: "blur(10px)", 
                    transition: "background 0.2s, color 0.2s", 
                    textDecoration: "none" 
                  }}
                  onMouseEnter={() => setLearnMoreHover(true)}
                  onMouseLeave={() => setLearnMoreHover(false)}
                >
                  Learn More
                </a>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.section>
    </main>
  );
}
