"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FiActivity } from "react-icons/fi";
import dynamic from "next/dynamic";

const Threads = dynamic(() => import("@/components/Threads"), { ssr: false });

export default function SignUp() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSignUp = (e: React.FormEvent) => {
    e.preventDefault();
    // Demo authentication: simply route to the app with a query parameter
    router.push("/?auth=true");
  };

  return (
    <main style={{ width: "100%", minHeight: "100vh", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#000", overflow: "hidden" }}>
      {/* Threads background */}
      <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
        <Threads
          amplitude={1}
          distance={0}
          enableMouseInteraction={true}
        />
      </div>

      {/* Top Navbar Logo */}
      <div style={{ position: "absolute", top: 32, left: 32, zIndex: 10, display: "flex", alignItems: "center", gap: 12, color: "#fff", fontWeight: 600, fontSize: 20 }}>
        <Link href="/" style={{ textDecoration: "none", color: "inherit", display: "flex", alignItems: "center", gap: 8 }}>
          <FiActivity size={24} color="#fff" /> FactPulse
        </Link>
      </div>

      {/* Sign Up Card */}
      <div style={{ position: "relative", zIndex: 10, width: "100%", maxWidth: 420, padding: 40, background: "rgba(10, 10, 15, 0.6)", backdropFilter: "blur(16px)", borderRadius: 24, border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 20px 40px rgba(0,0,0,0.4)" }}>
        <h1 style={{ color: "#fff", fontSize: 28, fontWeight: 700, marginBottom: 8, textAlign: "center" }}>Create Account</h1>
        <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, textAlign: "center", marginBottom: 32 }}>Sign up to start checking facts</p>

        <form onSubmit={handleSignUp} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ display: "block", color: "rgba(255,255,255,0.8)", fontSize: 13, marginBottom: 6, fontWeight: 500 }}>Full Name</label>
            <input 
              type="text" 
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
              style={{ width: "100%", padding: "12px 16px", background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff", fontSize: 15, outline: "none", transition: "border 0.2s" }}
              onFocus={e => e.target.style.borderColor = "#a855f7"}
              onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
            />
          </div>
          <div>
            <label style={{ display: "block", color: "rgba(255,255,255,0.8)", fontSize: 13, marginBottom: 6, fontWeight: 500 }}>Email Address</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              style={{ width: "100%", padding: "12px 16px", background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff", fontSize: 15, outline: "none", transition: "border 0.2s" }}
              onFocus={e => e.target.style.borderColor = "#a855f7"}
              onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
            />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: "block", color: "rgba(255,255,255,0.8)", fontSize: 13, marginBottom: 6, fontWeight: 500 }}>Password</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{ width: "100%", padding: "12px 16px", background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff", fontSize: 15, outline: "none", transition: "border 0.2s" }}
              onFocus={e => e.target.style.borderColor = "#a855f7"}
              onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
            />
          </div>
          <button 
            type="submit"
            style={{ width: "100%", padding: "14px", background: "#fff", color: "#000", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: "pointer", transition: "transform 0.2s, background 0.2s" }}
            onMouseOver={e => e.currentTarget.style.transform = "scale(1.02)"}
            onMouseOut={e => e.currentTarget.style.transform = "scale(1)"}
          >
            Create Account
          </button>
        </form>

        <p style={{ marginTop: 24, textAlign: "center", color: "rgba(255,255,255,0.6)", fontSize: 14 }}>
          Already have an account?{" "}
          <Link href="/signin" style={{ color: "#a855f7", textDecoration: "none", fontWeight: 600 }}>Sign in</Link>
        </p>
      </div>
    </main>
  );
}
