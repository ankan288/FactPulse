# FactPulse — Fact & Claim Verification System

An AI-powered fact-checking web app that extracts claims, retrieves live web evidence, and generates explainable accuracy reports.

## Quick Start

### 1. Backend Setup
```bash
cd backend
copy .env.example .env
# Fill in your API keys in .env
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
> **Tip:** You can also just double-click `start-backend.bat` in the root folder!

### 2. Frontend Setup (new terminal)
```bash
cd frontend
npm install
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)** to see the beautiful landing page.
Click **Get Started** (or navigate directly to **[http://localhost:3000/dashboard](http://localhost:3000/dashboard)**) to access the main FactCheck AI verification tool!

---

## API Keys Required (in `backend/.env`)

| Key | Where to get |
|-----|-------------|
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) (Used for lightning-fast claim extraction & verification) |
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com) (Fallback if Groq isn't used) |
| `TAVILY_API_KEY` | [app.tavily.com](https://app.tavily.com) (Free internet search for evidence) |
| `GOOGLE_API_KEY` + `GOOGLE_CSE_ID` | [console.cloud.google.com](https://console.cloud.google.com) (Fallback search) |

---

## Project Structure

```
GFG FINAL/
├── backend/
│   ├── main.py                  # FastAPI app + SSE pipeline
│   ├── models.py                # Pydantic schemas
│   ├── services/
│   │   ├── scraper.py           # URL → article text
│   │   ├── extractor.py         # Gemini Flash claim extraction
│   │   ├── searcher.py          # Tavily + Google CSE
│   │   ├── ranker.py            # Evidence credibility ranking
│   │   ├── verifier.py          # Hybrid 3-layer verification
│   │   └── ai_detector.py       # AI text probability
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── app/
    │   ├── page.tsx             # Main app page
    │   ├── layout.tsx           # Root layout
    │   └── globals.css          # Design system
    ├── components/
    │   ├── InputPanel.tsx       # Text/URL input
    │   ├── PipelineProgress.tsx # Live step tracker
    │   ├── ClaimCard.tsx        # Per-claim verdict card
    │   ├── AccuracyReport.tsx   # Summary with chart
    │   ├── AIDetectionBadge.tsx # AI authorship badge
    │   └── CitationChip.tsx     # Clickable source chip
    └── lib/api.ts               # SSE streaming client
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React, Framer Motion |
| Backend | Python, FastAPI, async SSE |
| LLM | Google Gemini 1.5 Flash + Pro (via LiteLLM) |
| Search | Tavily API (primary) + Google CSE (fallback) |
| Scraping | httpx + BeautifulSoup4 |
