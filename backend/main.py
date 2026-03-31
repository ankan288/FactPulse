import asyncio
import json
import logging
import os
import time
from collections import Counter
from urllib.parse import urlparse
from typing import AsyncGenerator, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.exceptions import RequestValidationError

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
from services.file_processor import process_file
from utils.cache import get_cache
from utils.errors import (
    VerificationError,
    verification_error_handler,
    validation_error_handler,
    generic_error_handler,
    InvalidInputError,
    MediaAnalysisError,
)

load_dotenv()

logger = logging.getLogger(__name__)

app = FastAPI(title="Fact & Claim Verification API", version="2.0.0")

# Register error handlers
app.add_exception_handler(VerificationError, verification_error_handler)
app.add_exception_handler(RequestValidationError, validation_error_handler)
app.add_exception_handler(Exception, generic_error_handler)

# Initialize cache (works even if Redis is not available)
claim_cache = get_cache()

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


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """
    Upload and process a media file (PDF, Image, Audio, Video, or Text).
    Extracts facts specifically automatically.
    """
    try:
        if not file.filename:
            return JSONResponse({"error": "No filename provided"}, status_code=400)
        
        # Read file content
        try:
            content = await file.read()
        except Exception as read_err:
            logger.error(f"Failed to read file {file.filename}: {read_err}")
            return JSONResponse({"error": f"Failed to read file: {str(read_err)}"}, status_code=400)
        
        logger.info(f"Received file upload: {file.filename} ({len(content)} bytes)")
        
        # Process file
        extracted_text = await process_file(file.filename, content)
        
        if not extracted_text:
            return JSONResponse({
                "error": f"Could not extract text from {file.filename}. Supported formats: PDF, JPG, PNG, GIF, WEBP, TXT, MP3, WAV, M4A, OGG, FLAC, MP4, MOV, AVI, MKV, WEBM"
            }, status_code=400)
        
        logger.info(f"Successfully extracted {len(extracted_text)} characters from {file.filename}")
        
        # Create VerifyRequest with extracted text
        verify_request = VerifyRequest(text=extracted_text)
        
        # Return streaming response
        return StreamingResponse(
            pipeline_stream(verify_request),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
        
    except Exception as e:
        logger.error(f"File upload error: {e}", exc_info=True)
        return {"error": f"File processing failed: {str(e)}"}


async def pipeline_stream(request: VerifyRequest) -> AsyncGenerator[str, None]:
    def emit(step: str, data: dict = {}) -> str:
        return f"data: {json.dumps({'step': step, **data})}\n\n"

    try:
        start_time = time.time()
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
        all_confidences = []
        all_sources = []
        debate_count = 0   # track how many debates have run (Groq rate limit guard)

        for claim in claims:
            cid = claim["id"]
            claim_text = claim["claim"]

            # ── Check cache first ──────────────────────────────────────────
            cached_result = claim_cache.get(claim_text)
            if cached_result and isinstance(cached_result, dict) and "verdict" in cached_result:
                logger.info("Using cached result for claim %s", cid)
                # Update claim ID to match current request
                cached_result["claimId"] = cid
                yield emit("result", cached_result)

                # Update stats
                v = cached_result.get("verdict", "UNVERIFIABLE")
                stats["true"] += int(v == "TRUE")
                stats["false"] += int(v == "FALSE")
                stats["partial"] += int(v == "PARTIALLY_TRUE")
                stats["unverifiable"] += int(v == "UNVERIFIABLE")
                stats["total_confidence"] += cached_result.get("confidence", 0)
                await asyncio.sleep(0.05)
                continue

            # ── Not in cache - proceed with verification ──────────────────
            yield emit("searching", {"claimId": cid, "query": claim_text[:100]})
            try:
                raw_evidence = await search_evidence(claim_text)
            except Exception as e:
                logger.error("Evidence search failed for claim %s: %s", cid, e)
                raw_evidence = []

            ranked = rank_evidence(claim_text, raw_evidence, temporal=claim.get("temporal", False))

            # ── Fast path: single-agent verification ──────────────────────
            yield emit("verifying", {"claimId": cid})
            try:
                result = await verify_claim(claim, ranked)
            except Exception as e:
                logger.error("Verification failed for claim %s: %s", cid, e, exc_info=True)
                result = {
                    "claimId": cid,
                    "claim": claim_text,
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
                    if debate_result and isinstance(debate_result, dict) and "verdict" in debate_result:
                        result = debate_result
                    else:
                        logger.warning("Debate returned invalid result for claim %s", cid)
                        result["reasoning"] += " (Debate escalation returned invalid result)"
                except Exception as e:
                    # Keep the single-agent result if debate itself fails
                    logger.error("Debate failed for claim %s: %s", cid, e, exc_info=True)
                    result["reasoning"] += f" (Debate escalation failed: {e})"
                debate_count += 1

            # ── Cache the result ──────────────────────────────────────────
            # Cache for 24 hours (86400 seconds)
            # Temporal claims get shorter TTL (6 hours) to stay fresh
            ttl = 21600 if claim.get("temporal", False) else 86400
            claim_cache.set(claim_text, result, ttl=ttl)

            yield emit("result", result)

            v = result.get("verdict", "UNVERIFIABLE")
            conf = result.get("confidence", 0)
            stats["true"] += int(v == "TRUE")
            stats["false"] += int(v == "FALSE")
            stats["partial"] += int(v == "PARTIALLY_TRUE")
            stats["unverifiable"] += int(v == "UNVERIFIABLE")
            stats["total_confidence"] += conf
            all_confidences.append(conf)
            
            # Extract domains for top sources
            for cit in result.get("citations", []):
                domain = urlparse(cit.get("url", "")).netloc
                if domain:
                    all_sources.append(domain.replace("www.", ""))
            
            await asyncio.sleep(0.05)

        # ── AI text detection ──────────────────────────────────────────────
        yield emit("detecting", {"message": "Analysing text for AI authorship…"})
        try:
            ai_result = await detect_ai_text(text)
            yield emit("ai_detection", ai_result)
        except Exception as e:
            logger.error("AI detection failed: %s", e, exc_info=True)
            yield emit("error", {
                "stage": "ai_detection",
                "message": f"AI authorship analysis unavailable: {str(e)}"
            })
            # Return partial results without AI detection
            ai_result = None
        
        # ── AI media detection ─────────────────────────────────────────────
        media_reports = []
        if scraped_images:
            yield emit("media_detecting", {"message": f"Analysing {len(scraped_images)} images for synthetic manipulation…"})
            try:
                media_reports = await detect_media(scraped_images)
                yield emit("media_results", {"reports": media_reports})
            except Exception as e:
                logger.error("Media detection failed: %s", e, exc_info=True)
                yield emit("error", {
                    "stage": "media_detection",
                    "message": f"Media analysis unavailable: {str(e)}"
                })
                # Continue without media reports
                media_reports = []

        # ── Summary & Fusion ───────────────────────────────────────────────
        total = len(claims)
        
        # Calculate confidence distribution
        buckets = {"0-20": 0, "20-40": 0, "40-60": 0, "60-80": 0, "80-100": 0}
        for s in all_confidences:
            if s <= 20: buckets["0-20"] += 1
            elif s <= 40: buckets["20-40"] += 1
            elif s <= 60: buckets["40-60"] += 1
            elif s <= 80: buckets["60-80"] += 1
            else: buckets["80-100"] += 1
        conf_dist = [{"range": k, "count": v} for k, v in buckets.items()]
        
        # Calculate top sources
        source_counts = Counter(all_sources)
        top_sources = [{"name": k, "count": v} for k, v in source_counts.most_common(5)]
        
        processing_time = round(time.time() - start_time, 2)
        avg_confidence = round(sum(all_confidences) / len(all_confidences)) if all_confidences else 0

        text_summary = {
            "total": total,
            "true": stats["true"],
            "false": stats["false"],
            "partial": stats["partial"],
            "unverifiable": stats["unverifiable"],
            "overallScore": avg_confidence,  # keep for backward compatibility
            "averageConfidence": avg_confidence,
            "processingTime": processing_time,
            "confidenceDistribution": conf_dist,
            "topSources": top_sources
        }
        
        fusion_report = generate_fusion_report(text_summary, media_reports)
        
        yield emit("done", {
            "summary": text_summary,
            "fusion": fusion_report
        })

    except Exception as e:
        yield emit("error", {"message": f"Pipeline error: {e}"})
