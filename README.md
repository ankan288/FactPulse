# FactPulse — Intelligent Fake News & Claim Verification Platform

FactPulse is a next-generation AI-powered fact-checking engine that extracts claims, retrieves live web evidence, performs deep media forensic analysis, and uses a multi-agent debate system to generate highly reliable, explainable accuracy reports.

With a beautiful, animated React Three Fiber & Framer Motion frontend, FactPulse provides an immersive, real-time experience as it uncovers the truth.

---

## ✨ Key Features

- **Multi-Agent Debate Verification:** Instead of relying on a single LLM, FactPulse pits multiple AI agents against each other to debate the credibility of evidence before reaching a verdict.
- **Deep Media Detection:** Analyzes uploaded Image, Video, and Audio files to detect AI manipulation, deepfakes, and synthetic generation.
- **AI Authorship Detection:** Scans text to determine the probability that it was written or edited by AI.
- **Real-Time Streaming Pipeline:** Uses Server-Sent Events (SSE) to elegantly stream the extraction, searching, and verification process to the UI in real-time.
- **Smart Input Detection:** Simply paste raw text or a URL, and FactPulse will automatically determine how to process it.
- **Immersive User Interface:** Built with bespoke CSS and React inline styles (Zero Tailwind dependency!), featuring interactive elements like `HoverButton`, `Typewriter`, and beautiful webgl backgrounds (`ColorBends`, `Galaxy`, `Hyperspeed`).
- **Comprehensive Fusion Reports:** Synthesizes individual claim verdicts, AI detection scores, and media forensics into a single, cohesive accuracy grade.

---

## 🚀 Quick Start

### 1. Backend Setup

The backend is built with Python, FastAPI, and asynchronous SSE streaming.

```bash
cd backend

# Copy environment variables and insert your API keys
copy .env.example .env

# Install dependencies
pip install -r requirements.txt

# Start the development server
uvicorn main:app --reload --port 8000
```
> **Tip:** On Windows, you can double-click `start-backend.bat` in the root folder to launch the API instantly!

### 2. Frontend Setup

The frontend is a gorgeous, interactive Next.js 14 application.

```bash
cd frontend

# Install Node dependencies
npm install

# Start the development server
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)** to see the animated hero section. Navigate to the dashboard to paste a link, upload an image, or enter text to begin fact-checking!

---

## 🔑 Required API Keys

Add the following keys to your `backend/.env` file:

| Key | Purpose | Get it here |
|-----|---------|-------------|
| `GROQ_API_KEY` | High-speed LLM inference for claim extraction, multi-agent debate, and fusion reporting. | [console.groq.com](https://console.groq.com) |
| `GEMINI_API_KEY` | Secondary LLM fallback and advanced multimodal analysis. | [aistudio.google.com](https://aistudio.google.com) |
| `TAVILY_API_KEY` | Primary search engine optimized for LLM evidence retrieval. | [app.tavily.com](https://app.tavily.com) |
| `GOOGLE_API_KEY` & `GOOGLE_CSE_ID` | Fallback traditional web search capabilities. | [console.cloud.google.com](https://console.cloud.google.com) |

---

## 📂 Project Architecture

### Backend (`/backend`)
Built on FastAPI, the backend handles complex orchestration:
- `services/debate_verifier.py` - Core logic for the LLM multi-agent truth debate.
- `services/media_detector.py` - Forensic evaluation of uploaded media files.
- `services/ai_detector.py` - Text probability analysis for LLM generation.
- `services/fusion.py` - Merges disparate reports into a unified summary.
- Various guides like `DEVELOPER_GUIDE.md`, `VERIFICATION_LOGIC.md`, and `GRACEFUL_DEGRADATION.md` for understanding system resilience.

### Frontend (`/frontend`)
A highly polished Next.js application:
- **Components:** Contains visually stunning elements like `HoverButton.tsx`, `Typewriter.tsx`, and `ProfileDropdown.tsx`.
- **Backgrounds:** Over a dozen interactive canvas backgrounds (e.g., `ColorBends.tsx`, `LiquidEther.jsx`).
- **Analysis Views:** `AccuracyReport.tsx`, `ClaimCard.tsx`, `MediaDetectionReport.tsx`, and `OriginalText.tsx` render the complex backend JSON into beautiful, readable UI.
- **Styling:** Relies strictly on native CSS Modules and React inline styles for bulletproof rendering.

---

## 🤝 Contributing

We welcome contributions! Please review the `DEVELOPER_GUIDE.md` in the backend directory for information on the verification logic, fallback mechanisms, and code architecture before submitting a pull request.
