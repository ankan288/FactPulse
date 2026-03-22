"use client";

import { motion } from "framer-motion";

interface Props {
  inputMode: "text" | "url";
  setInputMode: (m: "text" | "url") => void;
  inputValue: string;
  setInputValue: (v: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  onCancel?: () => void;
}

export default function InputPanel({
  inputMode, setInputMode, inputValue, setInputValue,
  onSubmit, isLoading, onCancel,
}: Props) {
  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit();
  };

  return (
    <motion.div
      className="glass"
      style={{ padding: "32px", display: "flex", flexDirection: "column", gap: "20px" }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      {/* Mode toggle */}
      <div style={{ display: "flex", gap: "8px", background: "rgba(0,0,0,0.3)", borderRadius: "10px", padding: "4px", width: "fit-content" }}>
        {(["text", "url"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => { setInputMode(mode); setInputValue(""); }}
            style={{
              padding: "8px 20px",
              borderRadius: "7px",
              border: "none",
              fontFamily: "Inter, sans-serif",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s",
              background: inputMode === mode ? "linear-gradient(135deg, var(--accent-violet), #5b21b6)" : "transparent",
              color: inputMode === mode ? "#fff" : "var(--text-secondary)",
              boxShadow: inputMode === mode ? "0 2px 10px rgba(124,58,237,0.4)" : "none",
            }}
          >
            {mode === "text" ? "✏️ Paste Text" : "🔗 Enter URL"}
          </button>
        ))}
      </div>

      {/* Input area */}
      {inputMode === "text" ? (
        <textarea
          id="text-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Paste an article, essay, or any text you want to fact-check…"
          disabled={isLoading}
          rows={7}
          style={{
            width: "100%",
            background: "rgba(0,0,0,0.3)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            padding: "16px",
            color: "var(--text-primary)",
            fontFamily: "Inter, sans-serif",
            fontSize: "14px",
            lineHeight: 1.7,
            resize: "vertical",
            outline: "none",
            transition: "border-color 0.2s",
          }}
          onFocus={(e) => (e.target.style.borderColor = "var(--border-accent)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
        />
      ) : (
        <input
          id="url-input"
          type="url"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          placeholder="https://example.com/news-article"
          disabled={isLoading}
          style={{
            width: "100%",
            background: "rgba(0,0,0,0.3)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            padding: "16px",
            color: "var(--text-primary)",
            fontFamily: "Inter, sans-serif",
            fontSize: "14px",
            outline: "none",
            transition: "border-color 0.2s",
          }}
          onFocus={(e) => (e.target.style.borderColor = "var(--border-accent)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
        />
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        <button
          id="analyze-btn"
          className="btn-primary"
          onClick={onSubmit}
          disabled={isLoading || !inputValue.trim()}
        >
          {isLoading ? (
            <>
              <span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" }} />
              Analyzing…
            </>
          ) : "🔍 Analyze"}
        </button>

        {isLoading && onCancel && (
          <button className="btn-secondary" onClick={onCancel}>✕ Cancel</button>
        )}

        <span style={{ marginLeft: "auto", color: "var(--text-muted)", fontSize: "12px" }}>
          {inputMode === "text" ? `${inputValue.length} chars` : "Press Enter to analyze"}
        </span>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </motion.div>
  );
}
