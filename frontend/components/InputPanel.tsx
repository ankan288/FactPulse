"use client";

import { motion } from "framer-motion";
import { IoArrowForward } from "react-icons/io5";
import { AiOutlineFileText } from "react-icons/ai";
import { MdOutlineLink, MdImage, MdVideoLibrary, MdAudioFile } from "react-icons/md";
import { useState, useRef, useEffect } from "react";

type InputModeType = "text" | "url" | "image" | "video" | "audio";

interface Props {
  inputMode: "text" | "url";
  setInputMode: (m: "text" | "url") => void;
  inputValue: string;
  setInputValue: (v: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  onCancel?: () => void;
  isCompactMode?: boolean;
  compactStyle?: React.CSSProperties;
  onFileSelect?: (file: File) => void;
}

export default function InputPanel({
  inputMode, setInputMode, inputValue, setInputValue,
  onSubmit, isLoading, onCancel, isCompactMode = false, compactStyle, onFileSelect,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [textareaRows, setTextareaRows] = useState(1);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
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

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      onSubmit();
    }
  };

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setInputValue(file.name);
    if (onFileSelect) {
      onFileSelect(file);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const handleAudioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const inputModes: { mode: InputModeType; icon: React.ReactNode; label: string; accept?: string }[] = [
    { mode: "text", icon: <AiOutlineFileText size={18} />, label: "Text" },
    { mode: "url", icon: <MdOutlineLink size={18} />, label: "URL" },
    { mode: "image", icon: <MdImage size={18} />, label: "Image", accept: "image/*" },
    { mode: "video", icon: <MdVideoLibrary size={18} />, label: "Video", accept: "video/*" },
    { mode: "audio", icon: <MdAudioFile size={18} />, label: "Audio", accept: "audio/*" },
  ];

  // Compact mode (bottom-left when showing results)
  if (isCompactMode) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{
          position: "fixed",
          bottom: 24,
          left: 24,
          width: "calc(100% - 48px)",
          maxWidth: 380,
          zIndex: 40,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          ...compactStyle,
        }}
      >
        {/* Compact mode selector */}
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
          {inputModes.map(({ mode, icon, label }) => (
            <button
              key={mode}
              onClick={() => {
                if (mode !== inputMode) {
                  setInputMode(mode as "text" | "url");
                  setInputValue("");
                  setSelectedFile(null);
                  if (mode === "image") imageInputRef.current?.click();
                  if (mode === "video") videoInputRef.current?.click();
                  if (mode === "audio") audioInputRef.current?.click();
                }
              }}
              disabled={isLoading}
              title={label}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid",
                borderColor: inputMode === mode ? "rgba(168,85,247,0.5)" : "rgba(255,255,255,0.1)",
                background: inputMode === mode ? "rgba(168,85,247,0.1)" : "rgba(255,255,255,0.03)",
                color: inputMode === mode ? "rgba(168,85,247,1)" : "rgba(255,255,255,0.6)",
                fontSize: 20,
                cursor: isLoading ? "not-allowed" : "pointer",
                transition: "all 0.2s",
                opacity: isLoading ? 0.5 : 1,
                fontFamily: "Inter, sans-serif",
                flexShrink: 0,
              }}
            >
              {icon}
            </button>
          ))}
        </div>

        {/* Compact input container */}
        <motion.div
          style={{
            background: "rgba(10,17,34,0.8)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12,
            padding: 12,
            display: "flex",
            gap: 8,
            alignItems: "flex-end",
            backdropFilter: "blur(12px)",
          }}
          onFocus={(e) => {
            if (e.currentTarget === e.target) return;
            e.currentTarget.style.borderColor = "rgba(168,85,247,0.4)";
          }}
          onBlur={(e) => {
            if (e.currentTarget === e.target) return;
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
          }}
        >
          {/* Input field */}
          {inputMode === "text" ? (
            <textarea
              ref={textareaRef}
              id="text-input-compact"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Paste text to fact-check…"
              disabled={isLoading}
              rows={textareaRows}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                color: "rgba(240,244,248,0.95)",
                fontFamily: "Inter, sans-serif",
                fontSize: 13,
                lineHeight: "24px",
                outline: "none",
                resize: "none",
                maxHeight: "96px",
                opacity: isLoading ? 0.5 : 1,
              }}
            />
          ) : inputMode === "url" ? (
            <input
              id="url-input-compact"
              type="url"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSubmit()}
              placeholder="Paste URL to analyze…"
              disabled={isLoading}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                color: "rgba(240,244,248,0.95)",
                fontFamily: "Inter, sans-serif",
                fontSize: 13,
                outline: "none",
                opacity: isLoading ? 0.5 : 1,
              }}
            />
          ) : (
            <span style={{ flex: 1, color: "rgba(240,244,248,0.7)", fontSize: 13 }}>
              {selectedFile ? selectedFile.name : `Click to select ${inputMode}…`}
            </span>
          )}

          {/* Send button */}
          <motion.button
            onClick={onSubmit}
            disabled={isLoading || !inputValue.trim()}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="Send (Ctrl+Enter)"
            style={{
              padding: 10,
              borderRadius: 8,
              border: "none",
              background: !inputValue.trim() ? "rgba(168,85,247,0.3)" : "linear-gradient(135deg, var(--accent-violet), #7c3aed)",
              color: "#fff",
              cursor: !inputValue.trim() ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s",
              opacity: isLoading ? 0.6 : 1,
              flexShrink: 0,
            }}
          >
            <IoArrowForward size={18} />
          </motion.button>
        </motion.div>

        {/* Hidden file inputs */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageChange}
          style={{ display: "none" }}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          onChange={handleVideoChange}
          style={{ display: "none" }}
        />
        <input
          ref={audioInputRef}
          type="file"
          accept="audio/*"
          onChange={handleAudioChange}
          style={{ display: "none" }}
        />
      </motion.div>
    );
  }

  // Full hero mode
  return (
    <motion.div
      className="glass"
      style={{ padding: "32px", display: "flex", flexDirection: "column", gap: "24px" }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      {/* Mode selector */}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        {inputModes.map(({ mode, icon, label }) => (
          <button
            key={mode}
            onClick={() => {
              if (mode !== inputMode) {
                setInputMode(mode as "text" | "url");
                setInputValue("");
                setSelectedFile(null);
                if (mode === "image") imageInputRef.current?.click();
                if (mode === "video") videoInputRef.current?.click();
                if (mode === "audio") audioInputRef.current?.click();
              }
            }}
            disabled={isLoading}
            title={label}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "12px 16px",
              borderRadius: 10,
              border: "1px solid",
              borderColor: inputMode === mode ? "rgba(168,85,247,0.5)" : "rgba(255,255,255,0.1)",
              background: inputMode === mode ? "rgba(168,85,247,0.15)" : "rgba(255,255,255,0.04)",
              color: inputMode === mode ? "rgba(168,85,247,1)" : "rgba(255,255,255,0.7)",
              fontSize: 24,
              cursor: isLoading ? "not-allowed" : "pointer",
              transition: "all 0.2s",
              opacity: isLoading ? 0.5 : 1,
              fontFamily: "Inter, sans-serif",
            }}
          >
            {icon}
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
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--border-accent)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
        />
      ) : inputMode === "url" ? (
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
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--border-accent)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
        />
      ) : (
        <div
          onClick={() => {
            if (inputMode === "image") imageInputRef.current?.click();
            if (inputMode === "video") videoInputRef.current?.click();
            if (inputMode === "audio") audioInputRef.current?.click();
          }}
          style={{
            width: "100%",
            minHeight: 120,
            background: "rgba(0,0,0,0.3)",
            border: "2px dashed var(--border)",
            borderRadius: "12px",
            padding: "32px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            cursor: isLoading ? "not-allowed" : "pointer",
            transition: "all 0.3s",
            opacity: isLoading ? 0.5 : 1,
          }}
          onMouseEnter={(e) => !isLoading && (e.currentTarget.style.borderColor = "var(--border-accent)")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
        >
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>
              {inputMode === "image" && "🖼️"}
              {inputMode === "video" && "🎬"}
              {inputMode === "audio" && "🎵"}
            </div>
            <p style={{ color: "var(--text-primary)", fontSize: 14, margin: 0 }}>
              {selectedFile ? selectedFile.name : `Click or drag to select ${inputMode}`}
            </p>
            <p style={{ color: "var(--text-muted)", fontSize: 12, margin: "4px 0 0 0" }}>
              {inputMode === "image" && "PNG, JPG, GIF up to 20MB"}
              {inputMode === "video" && "MP4, WebM, OGG up to 100MB"}
              {inputMode === "audio" && "MP3, WAV, OGG up to 50MB"}
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        <motion.button
          id="analyze-btn"
          className="btn-primary"
          onClick={onSubmit}
          disabled={isLoading || !inputValue.trim()}
          whileHover={!isLoading && inputValue.trim() ? { scale: 1.02 } : {}}
          whileTap={!isLoading && inputValue.trim() ? { scale: 0.98 } : {}}
        >
          {isLoading ? (
            <>
              <span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" }} />
              Analyzing…
            </>
          ) : (
            <>
              <IoArrowForward size={16} /> Analyze
            </>
          )}
        </motion.button>

        {isLoading && onCancel && (
          <motion.button className="btn-secondary" onClick={onCancel}>
            ✕ Cancel
          </motion.button>
        )}

        <span style={{ marginLeft: "auto", color: "var(--text-muted)", fontSize: "12px" }}>
          {inputMode === "text" ? `${inputValue.length} chars` : ""}
        </span>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageChange}
        style={{ display: "none" }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        onChange={handleVideoChange}
        style={{ display: "none" }}
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        onChange={handleAudioChange}
        style={{ display: "none" }}
      />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </motion.div>
  );
}
