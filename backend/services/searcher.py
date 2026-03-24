import asyncio
import logging
import os
from typing import List, Dict, Set

import httpx

logger = logging.getLogger(__name__)

# ─ Lazy-load spaCy NLP model ─────────────────────────────────────────────
_nlp = None

def _get_nlp():
    """Load spaCy model lazily on first use."""
    global _nlp
    if _nlp is None:
        try:
            import spacy
            _nlp = spacy.load("en_core_web_sm")
        except OSError:
            logger.warning("spaCy model 'en_core_web_sm' not found. Install with: python -m spacy download en_core_web_sm")
            _nlp = False  # Mark as failed so we don't retry
    return _nlp if _nlp is not False else None


# ── Query Expansion ────────────────────────────────────────────────────────

def _extract_entities(text: str) -> List[str]:
    """Extract named entities (PERSON, ORG, GPE, EVENT) from text using NER."""
    nlp = _get_nlp()
    if not nlp:
        return []
    
    try:
        doc = nlp(text[:500])  # Limit text length for efficiency
        entities = [ent.text for ent in doc.ents if ent.label_ in ("PERSON", "ORG", "GPE", "EVENT", "PRODUCT")]
        return list(set(entities))  # Remove duplicates
    except Exception as e:
        logger.debug("NER extraction failed: %s", e)
        return []


def _generate_query_variations(claim: str, max_variations: int = 3) -> List[str]:
    """Generate 2-3 query variations from a claim using:
    1. Original claim (exact match)
    2. Claim with entity emphasis (focus on extracted entities)
    3. Synonym-based variation
    
    Returns up to max_variations unique queries, prioritizing diversity.
    """
    variations = []
    
    # Variation 1: Original (exact)
    variations.append(claim)
    
    # Variation 2: Entity-focused (emphasize key entities)
    entities = _extract_entities(claim)
    if entities:
        # Create entity-focused query: "[Entity1] [Entity2] [Entity3] AND [main claim]"
        entity_query = " AND ".join(entities[:2]) + " " + claim
        variations.append(entity_query[:200])  # Limit length
    
    # Variation 3: Question format (e.g., "Is [claim]?")
    if len(claim) > 10:
        question_query = f"Is {claim}?"
        # Remove if too similar to original
        if question_query != variations[0]:
            variations.append(question_query)
    
    # Variation 4: Simplified (first ~15 words for shorter, focused search)
    words = claim.split()
    if len(words) > 15:
        simplified = " ".join(words[:15])
        if simplified not in variations:
            variations.append(simplified)
    
    # Return up to max_variations, filter empty strings
    return [v.strip() for v in variations[:max_variations] if v.strip()]


def _merge_and_dedupe_results(all_results: List[List[Dict]]) -> List[Dict]:
    """Merge results from multiple searches, dedup by URL, and rank by frequency.
    
    URLs appearing in multiple searches are ranked higher, as this indicates
    relevance across different query formulations.
    """
    url_to_result: Dict[str, Dict] = {}
    url_frequency: Dict[str, int] = {}
    
    for result_batch in all_results:
        for result in result_batch:
            url = result.get("url", "").lower()
            if url:
                # Track frequency (higher = more relevant across variations)
                url_frequency[url] = url_frequency.get(url, 0) + 1
                
                # Store result (prefer results from multiple queries)
                if url not in url_to_result:
                    url_to_result[url] = result
    
    # Sort by frequency (descending), then by source priority (Tavily > Google)
    sorted_results = sorted(
        url_to_result.values(),
        key=lambda r: (
            -url_frequency.get(r.get("url", "").lower(), 0),  # Frequency (descending)
            0 if r.get("source") == "tavily" else 1  # Source priority
        )
    )
    
    return sorted_results


async def search_evidence(query: str, max_results: int = 5, use_expansion: bool = True) -> List[Dict]:
    """Search using Tavily (primary) with Google CSE fallback.
    
    If use_expansion=True, generates query variations and merges results.
    This improves evidence quality by retrieving results from multiple
    query formulations of the same claim.
    """
    if use_expansion and len(query) > 20:  # Only expand for substantial queries
        variations = _generate_query_variations(query, max_variations=2)
        logger.debug("Query expansion: %d variations for claim", len(variations))
        
        # Search all variations in parallel
        all_results = await asyncio.gather(
            *[_search_single(v, max_results=max(3, max_results - 1)) for v in variations],
            return_exceptions=True
        )
        
        # Filter out exceptions and merge
        valid_results = [r for r in all_results if isinstance(r, list)]
        merged = _merge_and_dedupe_results(valid_results)
        
        # Return top max_results, preferring high-frequency results
        return merged[:max_results]
    else:
        # Single search for short queries
        return await _search_single(query, max_results)


async def _search_single(query: str, max_results: int = 5) -> List[Dict]:
    """Execute a single search query via Tavily or Google CSE."""
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

    logger.debug("All search providers exhausted for query: %s", query[:80])
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
