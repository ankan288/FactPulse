"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { MdErrorOutline } from "react-icons/md";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
          border: "1px solid rgba(255,59,48,0.3)",
          backgroundColor: "rgba(255,59,48,0.05)",
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
            display: "flex",
            justifyContent: "center",
            color: "#ff3b30",
          }}
        >
          <MdErrorOutline size={80} />
        </motion.div>

        <h1
          style={{
            fontSize: 32,
            fontWeight: 700,
            color: "#fff",
            marginBottom: 12,
          }}
        >
          Server Error
        </h1>

        <p
          style={{
            fontSize: 16,
            color: "rgba(240,244,248,0.7)",
            marginBottom: 32,
            lineHeight: "1.6",
          }}
        >
          Something went wrong on our end. Don't worry—our team has been notified and is working on a fix.
        </p>

        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <motion.button
            onClick={reset}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            style={{
              padding: "12px 32px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.1)",
              color: "#fff",
              cursor: "pointer",
              fontSize: 16,
              fontWeight: 600,
              transition: "all 0.2s",
            }}
          >
            Try Again
          </motion.button>

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
              Go Home
            </motion.button>
          </Link>
        </div>
      </motion.div>
    </main>
  );
}
