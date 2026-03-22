"use client";

interface Props {
  title: string;
  url: string;
  snippet: string;
  trustScore: number;
}

const TRUST_COLORS: Record<string, string> = {
  high: "#22c55e",
  medium: "#f59e0b",
  low: "#ef4444",
};

export default function CitationChip({ title, url, snippet, trustScore }: Props) {
  const tier = trustScore >= 70 ? "high" : trustScore >= 40 ? "medium" : "low";
  const color = TRUST_COLORS[tier];
  const domain = (() => { try { return new URL(url).hostname.replace("www.", ""); } catch { return url; } })();

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={snippet}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "5px 12px",
        borderRadius: "100px",
        background: "rgba(0,0,0,0.3)",
        border: `1px solid ${color}30`,
        color: "var(--text-secondary)",
        fontSize: "12px",
        fontWeight: 500,
        textDecoration: "none",
        transition: "all 0.15s",
        maxWidth: "200px",
        overflow: "hidden",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = color;
        (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = `${color}30`;
        (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {domain}
      </span>
      <span style={{ color: "var(--text-muted)", fontSize: "10px", flexShrink: 0 }}>↗</span>
    </a>
  );
}
