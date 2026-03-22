import os
from typing import List, Dict

import httpx


async def search_evidence(query: str, max_results: int = 5) -> List[Dict]:
    """Search using Tavily (primary) with Google CSE fallback."""
    tavily_key = os.getenv("TAVILY_API_KEY", "")
    if tavily_key:
        try:
            results = await _tavily(query, tavily_key, max_results)
            if results:
                return results
        except Exception:
            pass

    google_key = os.getenv("GOOGLE_API_KEY", "")
    cse_id = os.getenv("GOOGLE_CSE_ID", "")
    if google_key and cse_id:
        try:
            results = await _google_cse(query, google_key, cse_id, max_results)
            if results:
                return results
        except Exception:
            pass

    return []


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
