"use client";

import { motion } from "framer-motion";
import { IoArrowForward } from "react-icons/io5";
import { MdImage, MdVideoLibrary, MdAudioFile } from "react-icons/md";
import { useState, useRef, useEffect } from "react";

// Detect if a string looks like a URL
function looksLikeUrl(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    /^www\.[a-z0-9-]+\.[a-z]{2,}/i.test(trimmed)
  );
}

type FileMode = "image" | "video" | "audio";

interface Props {
  inputMode: "text" | "url";
  setInputMode: (m: "text" | "url") => void;
  inputValue: string;
  setInputValue: (v: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  onCancel?: () => void;
  isCompactMode?: boolean;
  onFileSelect?: (file: File) => void;
}

export default function InputPanel({
  inputMode, setInputMode, inputValue, setInputValue,
  onSubmit, isLoading, onCancel, isCompactMode = false, onFileSelect,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [textareaRows, setTextareaRows] = useState(1);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileMode, setFileMode] = useState<FileMode | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // Auto-expand textarea while typing (max 4 lines)
  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    const newRows = Math.min(Math.ceil(textareaRef.current.scrollHeight / 24), 4);
    setTextareaRows(newRows);
  }, [inputValue]);

  // Auto-detect URL vs text as user types
  const handleChange = (val: string) => {
    setInputValue(val);
    setInputMode(looksLikeUrl(val) ? "url" : "text");
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit();
  };

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setInputValue(file.name);
    if (onFileSelect) onFileSelect(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
  };

  const fileModes: { mode: FileMode; icon: React.ReactNode; label: string; ref: React.RefObject<HTMLInputElement | null>; accept: string }[] = [
    { mode: "image", icon: <MdImage size={18} />, label: "Image", ref: imageInputRef, accept: "image/*" },
    { mode: "video", icon: <MdVideoLibrary size={18} />, label: "Video", ref: videoInputRef, accept: "video/*" },
    { mode: "audio", icon: <MdAudioFile size={18} />, label: "Audio", ref: audioInputRef, accept: "audio/*" },
  ];

  const isUrl = looksLikeUrl(inputValue);
  const placeholder = isCompactMode
    ? "Paste text or URL…"
    : "Paste text, article, or URL to fact-check…";

  const canSubmit = !isLoading && (!!inputValue.trim() || !!selectedFile);

  // ── Compact mode (bottom-left when showing results) ──────────────────────
  if (isCompactMode) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{
          position: "fixed",
          bottom: 24, left: 24,
          width: "calc(100% - 48px)",
          maxWidth: 380,
          zIndex: 40,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {/* File-type tabs (image / video / audio only) */}
        <div style={{ display: "flex", gap: 8 }}>
          {fileModes.map(({ mode, icon, label, ref }) => (
            <button
              key={mode}
              onClick={() => {
                setFileMode(mode === fileMode ? null : mode);
                setSelectedFile(null);
                setInputValue("");
                if (mode !== fileMode) ref.current?.click();
              }}
              disabled={isLoading}
              title={label}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "8px 12px", borderRadius: 8, border: "1px solid",
                borderColor: fileMode === mode ? "rgba(168,85,247,0.5)" : "rgba(255,255,255,0.1)",
                background: fileMode === mode ? "rgba(168,85,247,0.1)" : "rgba(255,255,255,0.03)",
                color: fileMode === mode ? "rgba(168,85,247,1)" : "rgba(255,255,255,0.5)",
                fontSize: 18, cursor: isLoading ? "not-allowed" : "pointer",
                transition: "all 0.2s", opacity: isLoading ? 0.5 : 1,
                flexShrink: 0,
              }}
            >
              {icon}
            </button>
          ))}
        </div>

        {/* Single smart input */}
        <motion.div
          style={{
            background: "rgba(10,17,34,0.85)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12, padding: 12,
            display: "flex", gap: 8, alignItems: "flex-end",
            backdropFilter: "blur(12px)",
          }}
        >
          {fileMode && selectedFile ? (
            <span style={{ flex: 1, color: "rgba(240,244,248,0.7)", fontSize: 13 }}>
              {selectedFile.name}
            </span>
          ) : (
            <div style={{ flex: 1, position: "relative" }}>
              {isUrl && (
                <span style={{
                  position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)",
                  fontSize: 11, color: "rgba(168,85,247,0.9)",
                  background: "rgba(168,85,247,0.12)", borderRadius: 4,
                  padding: "1px 6px", pointerEvents: "none",
                }}>🔗 URL</span>
              )}
              <textarea
                ref={textareaRef}
                id="smart-input-compact"
                value={inputValue}
                onChange={(e) => handleChange(e.target.value)}
                onKeyDown={handleKey}
                placeholder={placeholder}
                disabled={isLoading}
                rows={textareaRows}
                style={{
                  width: "100%", background: "transparent", border: "none",
                  color: "rgba(240,244,248,0.95)",
                  fontFamily: "Inter, sans-serif", fontSize: 13,
                  lineHeight: "24px", outline: "none", resize: "none",
                  maxHeight: "96px", opacity: isLoading ? 0.5 : 1,
                }}
              />
            </div>
          )}

          <motion.button
            onClick={onSubmit}
            disabled={!canSubmit}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="Send (Ctrl+Enter)"
            style={{
              padding: 10, borderRadius: 8, border: "none",
              background: !canSubmit ? "rgba(168,85,247,0.3)" : "linear-gradient(135deg, var(--accent-violet), #7c3aed)",
              color: "#fff",
              cursor: !canSubmit ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.2s", opacity: isLoading ? 0.6 : 1, flexShrink: 0,
            }}
          >
            <IoArrowForward size={18} />
          </motion.button>
        </motion.div>

        {/* Hidden file inputs */}
        {fileModes.map(({ mode, ref, accept }) => (
          <input key={mode} ref={ref} type="file" accept={accept} onChange={handleFileChange} style={{ display: "none" }} />
        ))}
      </motion.div>
    );
  }

  // ── Full hero mode ────────────────────────────────────────────────────────
  return (
    <motion.div
      className="glass"
      style={{ padding: "32px", display: "flex", flexDirection: "column", gap: "24px" }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      {/* File-type tabs only */}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginRight: 4 }}>Attach:</span>
        {fileModes.map(({ mode, icon, label, ref }) => (
          <button
            key={mode}
            onClick={() => {
              setFileMode(mode === fileMode ? null : mode);
              setSelectedFile(null);
              setInputValue("");
              if (mode !== fileMode) ref.current?.click();
            }}
            disabled={isLoading}
            title={label}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: 10, border: "1px solid",
              borderColor: fileMode === mode ? "rgba(168,85,247,0.5)" : "rgba(255,255,255,0.1)",
              background: fileMode === mode ? "rgba(168,85,247,0.15)" : "rgba(255,255,255,0.04)",
              color: fileMode === mode ? "rgba(168,85,247,1)" : "rgba(255,255,255,0.6)",
              fontSize: 13, cursor: isLoading ? "not-allowed" : "pointer",
              transition: "all 0.2s", opacity: isLoading ? 0.5 : 1,
              fontFamily: "Inter, sans-serif",
            }}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {/* Smart single input */}
      {fileMode && selectedFile ? (
        <div
          style={{
            width: "100%", minHeight: 100,
            background: "rgba(0,0,0,0.3)", border: "2px dashed var(--border)",
            borderRadius: "12px", padding: "24px",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
          }}
          onClick={() => {
            if (fileMode === "image") imageInputRef.current?.click();
            if (fileMode === "video") videoInputRef.current?.click();
            if (fileMode === "audio") audioInputRef.current?.click();
          }}
        >
          <p style={{ color: "var(--text-primary)", fontSize: 14, margin: 0 }}>
            {fileMode === "image" ? "🖼️" : fileMode === "video" ? "🎬" : "🎵"} {selectedFile.name}
          </p>
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          {isUrl && (
            <div style={{
              position: "absolute", top: 12, right: 16, zIndex: 1,
              fontSize: 12, color: "rgba(168,85,247,0.9)",
              background: "rgba(168,85,247,0.12)", borderRadius: 6,
              padding: "2px 10px", pointerEvents: "none",
            }}>
              🔗 URL detected
            </div>
          )}
          <textarea
            id="smart-input"
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKey}
            placeholder={placeholder}
            disabled={isLoading}
            rows={isUrl ? 2 : 7}
            style={{
              width: "100%", background: "rgba(0,0,0,0.3)",
              border: "1px solid var(--border)", borderRadius: "12px",
              padding: "16px", color: "var(--text-primary)",
              fontFamily: "Inter, sans-serif", fontSize: "14px",
              lineHeight: 1.7, resize: "vertical", outline: "none",
              transition: "border-color 0.2s",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--border-accent)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
          />
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        <motion.button
          id="analyze-btn"
          className="btn-primary"
          onClick={onSubmit}
          disabled={!canSubmit}
          whileHover={canSubmit ? { scale: 1.02 } : {}}
          whileTap={canSubmit ? { scale: 0.98 } : {}}
        >
          {isLoading ? (
            <>
              <span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" }} />
              Analyzing…
            </>
          ) : (
            <><IoArrowForward size={16} /> Analyze</>
          )}
        </motion.button>

        {isLoading && onCancel && (
          <motion.button className="btn-secondary" onClick={onCancel}>✕ Cancel</motion.button>
        )}

        <span style={{ marginLeft: "auto", color: "var(--text-muted)", fontSize: "12px" }}>
          {!isUrl && inputValue ? `${inputValue.length} chars` : ""}
        </span>
      </div>

      {/* Hidden file inputs */}
      {fileModes.map(({ mode, ref, accept }) => (
        <input key={mode} ref={ref} type="file" accept={accept} onChange={handleFileChange} style={{ display: "none" }} />
      ))}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </motion.div>
  );
}
