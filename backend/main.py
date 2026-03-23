import asyncio
import json
import os
from typing import AsyncGenerator, Optional

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from models import ExtractURLRequest, VerifyRequest
from services.ai_detector import detect_ai_text
from services.extractor import extract_claims
from services.ranker import rank_evidence
from services.scraper import ScraperException, scrape_url
from services.searcher import search_evidence
from services.verifier import verify_claim
from services.debate_verifier import debate_verify
from services.media_detector import detect_media
from services.fusion import generate_fusion_report

load_dotenv()

app = FastAPI(title="Fact & Claim Verification API", version="2.0.0")

# ── Multi-agent debate settings ────────────────────────────────────────────
# Trigger adversarial debate when initial confidence is below this threshold
DEBATE_CONFIDENCE_THRESHOLD = 55
# Max number of debates per request (protects Groq free tier rate limits)
MAX_DEBATE_CLAIMS = 3

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "2.0.0"}


@app.post("/api/extract-url")
async def extract_url_route(request: ExtractURLRequest):
    try:
        result = await scrape_url(str(request.url))
        return result
    except ScraperException as e:
        return {"error": str(e)}


@app.post("/api/verify")
async def verify_route(request: VerifyRequest):
    return StreamingResponse(
        pipeline_stream(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


async def pipeline_stream(request: VerifyRequest) -> AsyncGenerator[str, None]:
    def emit(step: str, data: dict = {}) -> str:
        return f"data: {json.dumps({'step': step, **data})}\n\n"

    try:
        text = request.text

        # ── Fetch article if URL provided ──────────────────────────────────
        scraped_images = []
        if not text and request.url:
            yield emit("status", {"message": "Fetching article from URL…"})
            try:
                scraped = await scrape_url(str(request.url))
                text = scraped["text"]
                scraped_images = scraped.get("images", [])
                yield emit("status", {"message": f"Fetched: {scraped.get('title', 'Article')}"})
            except ScraperException as e:
                yield emit("error", {"message": str(e)})
                return

        if not text or len(text.strip()) < 3:
            yield emit("error", {"message": "Input text is too short to analyse. Please provide at least 3 characters."})
            return

        # ── Step 1: Extract claims ─────────────────────────────────────────
        yield emit("extracting", {"message": "Extracting verifiable claims…"})
        try:
            claims = await extract_claims(text)
        except Exception as e:
            yield emit("error", {"message": f"Claim extraction failed: {e}"})
            return

        if not claims:
            yield emit("error", {"message": "No verifiable claims found in the text."})
            return

        yield emit("claims_found", {"count": len(claims)})
        for claim in claims:
            yield emit("claim", claim)
        await asyncio.sleep(0.05)

        # ── Steps 2‑4: Search → Rank → Verify each claim ──────────────────
        stats = {"true": 0, "false": 0, "partial": 0, "unverifiable": 0, "total_confidence": 0}
        debate_count = 0   # track how many debates have run (Groq rate limit guard)

        for claim in claims:
            cid = claim["id"]

            yield emit("searching", {"claimId": cid, "query": claim["claim"][:100]})
            try:
                raw_evidence = await search_evidence(claim["claim"])
            except Exception:
                raw_evidence = []

            ranked = rank_evidence(claim["claim"], raw_evidence, temporal=claim.get("temporal", False))

            # ── Fast path: single-agent verification ──────────────────────
            yield emit("verifying", {"claimId": cid})
            try:
                result = await verify_claim(claim, ranked)
            except Exception as e:
                result = {
                    "claimId": cid,
                    "claim": claim["claim"],
                    "verdict": "UNVERIFIABLE",
                    "confidence": 0,
                    "reasoning": f"Verification failed: {e}",
                    "citations": [],
                    "conflicting": False,
                    "ambiguous": claim.get("ambiguous", False),
                    "temporal": claim.get("temporal", False),
                }

            # ── Escalate to debate if uncertain and under cap ─────────────
            needs_debate = (
                result["confidence"] < DEBATE_CONFIDENCE_THRESHOLD
                and debate_count < MAX_DEBATE_CLAIMS
            )

            if needs_debate:
                yield emit("debating", {
                    "claimId": cid,
                    "message": f"Confidence {result['confidence']}% — escalating to adversarial debate…",
                })
                try:
                    debate_result = await debate_verify(claim, ranked)
                    result = debate_result
                except Exception as e:
                    # Keep the single-agent result if debate itself fails
                    result["reasoning"] += f" (Debate escalation failed: {e})"
                debate_count += 1

            yield emit("result", result)

            v = result.get("verdict", "UNVERIFIABLE")
            stats["true"] += v == "TRUE"
            stats["false"] += v == "FALSE"
            stats["partial"] += v == "PARTIALLY_TRUE"
            stats["unverifiable"] += v == "UNVERIFIABLE"
            stats["total_confidence"] += result.get("confidence", 0)
            await asyncio.sleep(0.05)

        # ── AI text detection ──────────────────────────────────────────────
        yield emit("detecting", {"message": "Analysing text for AI authorship…"})
        try:
            ai_result = await detect_ai_text(text)
        except Exception:
            ai_result = {"score": 50, "label": "AI_ASSISTED", "signals": []}
        yield emit("ai_detection", ai_result)
        
        # ── AI media detection ─────────────────────────────────────────────
        media_reports = []
        if scraped_images:
            yield emit("media_detecting", {"message": f"Analysing {len(scraped_images)} images for synthetic manipulation…"})
            try:
                media_reports = await detect_media(scraped_images)
                yield emit("media_results", {"reports": media_reports})
            except Exception as e:
                yield emit("error", {"message": f"Media detection failed: {e}"})

        # ── Summary & Fusion ───────────────────────────────────────────────
        total = len(claims)
        text_summary = {
            "total": total,
            "true": stats["true"],
            "false": stats["false"],
            "partial": stats["partial"],
            "unverifiable": stats["unverifiable"],
            "overallScore": round(stats["total_confidence"] / total) if total else 0,
        }
        
        fusion_report = generate_fusion_report(text_summary, media_reports)
        
        yield emit("done", {
            "summary": text_summary,
            "fusion": fusion_report
        })

    except Exception as e:
        yield emit("error", {"message": f"Pipeline error: {e}"})
