"use client";

import React, { ReactNode, ReactElement } from "react";
import { motion } from "framer-motion";
import { MdErrorOutline, MdRefresh } from "react-icons/md";

interface Props {
  children: ReactNode;
  fallback?: ReactElement;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Error caught by boundary:", error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#000",
            padding: "24px",
          }}
        >
          <div
            style={{
              maxWidth: 500,
              textAlign: "center",
              borderRadius: 12,
              border: "1px solid rgba(255,59,48,0.3)",
              backgroundColor: "rgba(255,59,48,0.05)",
              padding: "32px 24px",
            }}
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1 }}
              style={{
                fontSize: 48,
                marginBottom: 16,
                display: "flex",
                justifyContent: "center",
                color: "#ff3b30",
              }}
            >
              <MdErrorOutline size={48} />
            </motion.div>

            <h1
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: "#fff",
                marginBottom: 8,
              }}
            >
              Oops! Something went wrong
            </h1>

            <p
              style={{
                fontSize: 14,
                color: "rgba(240,244,248,0.7)",
                marginBottom: 16,
                lineHeight: "1.5",
              }}
            >
              An unexpected error occurred. Our team has been notified.
              {process.env.NODE_ENV === "development" && this.state.error && (
                <>
                  <br />
                  <br />
                  <span style={{ fontSize: 12, color: "rgba(240,244,248,0.5)" }}>
                    {this.state.error.toString()}
                  </span>
                </>
              )}
            </p>

            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <motion.button
                onClick={this.handleReset}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                style={{
                  padding: "10px 24px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.2)",
                  background: "rgba(255,255,255,0.1)",
                  color: "#fff",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 14,
                  fontWeight: 500,
                  transition: "all 0.2s",
                }}
              >
                <MdRefresh size={16} /> Try Again
              </motion.button>

              <motion.button
                onClick={() => (window.location.href = "/")}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                style={{
                  padding: "10px 24px",
                  borderRadius: 8,
                  background: "linear-gradient(135deg, var(--accent-violet), #7c3aed)",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 500,
                  transition: "all 0.2s",
                }}
              >
                Go Home
              </motion.button>
            </div>
          </div>
        </motion.div>
      );
    }

    return this.props.children;
  }
}
