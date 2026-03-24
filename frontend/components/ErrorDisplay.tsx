"use client";

import { motion, AnimatePresence } from "framer-motion";
import { MdErrorOutline, MdWarningAmber, MdClose } from "react-icons/md";

interface ErrorDisplayProps {
  error: string;
  type?: "error" | "warning" | "info";
  onDismiss?: () => void;
  isDismissible?: boolean;
}

export default function ErrorDisplay({
  error,
  type = "error",
  onDismiss,
  isDismissible = true,
}: ErrorDisplayProps) {
  const bgColor =
    type === "error"
      ? "rgba(255,59,48,0.1)"
      : type === "warning"
        ? "rgba(255,193,7,0.1)"
        : "rgba(33,150,243,0.1)";

  const borderColor =
    type === "error"
      ? "rgba(255,59,48,0.3)"
      : type === "warning"
        ? "rgba(255,193,7,0.3)"
        : "rgba(33,150,243,0.3)";

  const textColor =
    type === "error"
      ? "#ff3b30"
      : type === "warning"
        ? "#ffc107"
        : "#2196f3";

  const icon =
    type === "error" ? (
      <MdErrorOutline size={20} />
    ) : type === "warning" ? (
      <MdWarningAmber size={20} />
    ) : (
      <MdErrorOutline size={20} />
    );

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        style={{
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
          padding: "12px 16px",
          borderRadius: 8,
          border: `1px solid ${borderColor}`,
          backgroundColor: bgColor,
          color: "rgba(240,244,248,0.9)",
          fontSize: 14,
          lineHeight: "1.5",
        }}
      >
        <div style={{ color: textColor, marginTop: 2, flexShrink: 0 }}>
          {icon}
        </div>
        <div style={{ flex: 1 }}>{error}</div>
        {isDismissible && onDismiss && (
          <motion.button
            onClick={onDismiss}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            style={{
              background: "none",
              border: "none",
              color: textColor,
              cursor: "pointer",
              padding: 0,
              display: "flex",
              alignItems: "center",
              marginTop: 2,
            }}
          >
            <MdClose size={20} />
          </motion.button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
