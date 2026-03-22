import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FactPulse — Real-Time Claim Verification",
  description:
    "AI-powered fact-checking engine that extracts claims, searches live web evidence, and generates explainable accuracy reports with source citations.",
  keywords: ["fact check", "AI verification", "claim analysis", "misinformation detection"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
