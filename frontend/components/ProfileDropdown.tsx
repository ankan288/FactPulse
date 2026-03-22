"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

interface ProfileDropdownProps {
  username?: string;
  email?: string;
}

export default function ProfileDropdown({ username = "User", email = "user@example.com" }: ProfileDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    // Clear any auth tokens
    localStorage.removeItem("authToken");
    // Redirect to signin
    router.push("/signin");
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      {/* Profile Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: "rgba(168,85,247,0.2)",
          border: "1px solid rgba(168,85,247,0.3)",
          color: "rgba(168,85,247,1)",
          cursor: "pointer",
          fontSize: 20,
          transition: "all 0.2s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(168,85,247,0.3)";
          e.currentTarget.style.borderColor = "rgba(168,85,247,0.5)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(168,85,247,0.2)";
          e.currentTarget.style.borderColor = "rgba(168,85,247,0.3)";
        }}
        title="Profile"
      >
        👤
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              marginTop: 12,
              width: 240,
              background: "linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(20,28,48,0.95) 100%)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(168,85,247,0.2)",
              borderRadius: 12,
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.5), 0 10px 10px -5px rgba(0,0,0,0.3)",
              zIndex: 1000,
              overflow: "hidden",
            }}
          >
            {/* User Info Section */}
            <div style={{ padding: "16px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#f0f4f8", marginBottom: 4 }}>
                👤 {username}
              </div>
              <div style={{ fontSize: 12, color: "rgba(240,244,248,0.6)" }}>
                {email}
              </div>
            </div>

            {/* History Option */}
            <button
              onClick={() => {
                router.push("/history");
                setIsOpen(false);
              }}
              style={{
                width: "100%",
                padding: "12px 16px",
                background: "transparent",
                border: "none",
                color: "rgba(240,244,248,0.8)",
                fontSize: 14,
                textAlign: "left",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(168,85,247,0.1)";
                e.currentTarget.style.color = "#f0f4f8";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "rgba(240,244,248,0.8)";
              }}
            >
              📜 History
            </button>

            {/* Settings Option */}
            <button
              onClick={() => {
                router.push("/settings");
                setIsOpen(false);
              }}
              style={{
                width: "100%",
                padding: "12px 16px",
                background: "transparent",
                border: "none",
                color: "rgba(240,244,248,0.8)",
                fontSize: 14,
                textAlign: "left",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(168,85,247,0.1)";
                e.currentTarget.style.color = "#f0f4f8";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "rgba(240,244,248,0.8)";
              }}
            >
              ⚙️ Settings
            </button>

            {/* Divider */}
            <div style={{ height: "1px", background: "rgba(255,255,255,0.08)" }} />

            {/* Logout Option */}
            <button
              onClick={handleLogout}
              style={{
                width: "100%",
                padding: "12px 16px",
                background: "transparent",
                border: "none",
                color: "rgba(244,63,94,0.8)",
                fontSize: 14,
                textAlign: "left",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(244,63,94,0.1)";
                e.currentTarget.style.color = "#f87171";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "rgba(244,63,94,0.8)";
              }}
            >
              🚪 Logout
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
