"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { MdWarning } from "react-icons/md";

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#000",
        padding: "24px",
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          maxWidth: 500,
          textAlign: "center",
          borderRadius: 12,
          border: "1px solid rgba(168,85,247,0.3)",
          backgroundColor: "rgba(168,85,247,0.05)",
          padding: "48px 32px",
        }}
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1 }}
          style={{
            fontSize: 80,
            marginBottom: 24,
            color: "#a855f7",
          }}
        >
          404
        </motion.div>

        <h1
          style={{
            fontSize: 32,
            fontWeight: 700,
            color: "#fff",
            marginBottom: 12,
          }}
        >
          Page Not Found
        </h1>

        <p
          style={{
            fontSize: 16,
            color: "rgba(240,244,248,0.7)",
            marginBottom: 32,
            lineHeight: "1.6",
          }}
        >
          The page you're looking for doesn't exist or has been moved. Let's get you back on track.
        </p>

        <Link href="/">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            style={{
              padding: "12px 32px",
              borderRadius: 8,
              background: "linear-gradient(135deg, var(--accent-violet), #7c3aed)",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontSize: 16,
              fontWeight: 600,
              transition: "all 0.2s",
            }}
          >
            Back to Home
          </motion.button>
        </Link>
      </motion.div>
    </main>
  );
}
