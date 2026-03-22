import asyncio
import logging
import os
from typing import List, Dict

import httpx

logger = logging.getLogger(__name__)


async def search_evidence(query: str, max_results: int = 5) -> List[Dict]:
    """Search using Tavily (primary) with Google CSE fallback.
    Both providers use retry with exponential backoff for rate-limit resilience.
    """
    tavily_key = os.getenv("TAVILY_API_KEY", "")
    if tavily_key:
        results = await _tavily_with_retry(query, tavily_key, max_results)
        if results:
            return results

    google_key = os.getenv("GOOGLE_API_KEY", "")
    cse_id = os.getenv("GOOGLE_CSE_ID", "")
    if google_key and cse_id:
        results = await _google_cse_with_retry(query, google_key, cse_id, max_results)
        if results:
            return results

    logger.warning("All search providers exhausted for query: %s", query[:80])
    return []


# ── Retry wrappers ──────────────────────────────────────────────────────────

async def _tavily_with_retry(query: str, api_key: str, max_results: int, retries: int = 3) -> List[Dict]:
    """Retry Tavily up to `retries` times with exponential backoff (1s, 2s, 4s)."""
    for attempt in range(retries):
        try:
            return await _tavily(query, api_key, max_results)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                wait = 2 ** attempt
                logger.warning("Tavily rate-limited (429). Waiting %ds (attempt %d/%d)…", wait, attempt + 1, retries)
                await asyncio.sleep(wait)
            else:
                logger.error("Tavily HTTP error %d: %s", e.response.status_code, e)
                break
        except Exception as e:
            logger.error("Tavily search failed (attempt %d/%d): %s", attempt + 1, retries, e)
            if attempt < retries - 1:
                await asyncio.sleep(2 ** attempt)
    return []


async def _google_cse_with_retry(query: str, api_key: str, cse_id: str, max_results: int, retries: int = 3) -> List[Dict]:
    """Retry Google CSE up to `retries` times with exponential backoff."""
    for attempt in range(retries):
        try:
            return await _google_cse(query, api_key, cse_id, max_results)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                wait = 2 ** attempt
                logger.warning("Google CSE rate-limited (429). Waiting %ds (attempt %d/%d)…", wait, attempt + 1, retries)
                await asyncio.sleep(wait)
            else:
                logger.error("Google CSE HTTP error %d: %s", e.response.status_code, e)
                break
        except Exception as e:
            logger.error("Google CSE search failed (attempt %d/%d): %s", attempt + 1, retries, e)
            if attempt < retries - 1:
                await asyncio.sleep(2 ** attempt)
    return []


# ── Raw API callers ─────────────────────────────────────────────────────────

async def _tavily(query: str, api_key: str, max_results: int) -> List[Dict]:
    async with httpx.AsyncClient(timeout=12.0) as client:
        r = await client.post(
            "https://api.tavily.com/search",
            json={
                "api_key": api_key,
                "query": query,
                "max_results": max_results,
                "search_depth": "advanced",
                "include_raw_content": False,
            },
        )
        r.raise_for_status()
        data = r.json()
    return [
        {
            "title": item.get("title", ""),
            "url": item.get("url", ""),
            "snippet": item.get("content", "")[:600],
            "published_date": item.get("published_date"),
            "source": "tavily",
        }
        for item in data.get("results", [])
    ]


async def _google_cse(query: str, api_key: str, cse_id: str, max_results: int) -> List[Dict]:
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(
            "https://www.googleapis.com/customsearch/v1",
            params={"key": api_key, "cx": cse_id, "q": query, "num": min(max_results, 10)},
        )
        r.raise_for_status()
        data = r.json()
    return [
        {
            "title": item.get("title", ""),
            "url": item.get("link", ""),
            "snippet": item.get("snippet", "")[:600],
            "published_date": None,
            "source": "google_cse",
        }
        for item in data.get("items", [])
    ]
