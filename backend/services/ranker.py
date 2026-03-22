import re
from datetime import datetime
from typing import List, Dict

HIGH_AUTHORITY = {
    ".gov", ".edu", ".int", ".mil",
    "reuters.com", "apnews.com", "bbc.com", "bbc.co.uk",
    "nytimes.com", "washingtonpost.com", "theguardian.com",
    "nature.com", "science.org", "ncbi.nlm.nih.gov", "pubmed.ncbi.nlm.nih.gov",
    "who.int", "un.org", "worldbank.org", "cdc.gov", "nasa.gov", "nih.gov",
    "britannica.com", "wikipedia.org",
    "economist.com", "bloomberg.com", "ft.com", "wsj.com", "forbes.com",
}

MEDIUM_AUTHORITY = {
    "techcrunch.com", "wired.com", "time.com", "newsweek.com",
    "usatoday.com", "nbcnews.com", "cbsnews.com", "politico.com",
    "thehill.com", "vox.com", "slate.com", "vice.com",
}

STOPWORDS = {
    "the", "a", "an", "in", "on", "at", "is", "are", "was", "were",
    "and", "or", "but", "of", "to", "for", "with", "by", "this", "that",
    "it", "its", "be", "been", "have", "has", "had", "from",
}


def _domain_score(url: str) -> int:
    u = url.lower()
    if any(d in u for d in HIGH_AUTHORITY):
        return 40
    if any(d in u for d in MEDIUM_AUTHORITY):
        return 25
    if ".gov" in u or ".edu" in u:
        return 40
    return 10


def _recency_score(published_date) -> int:
    if not published_date:
        return 15
    try:
        pub = datetime.strptime(str(published_date)[:10], "%Y-%m-%d")
        days = (datetime.now() - pub).days
        if days < 30:
            return 30
        if days < 180:
            return 25
        if days < 365:
            return 20
        if days < 730:
            return 12
        return 5
    except Exception:
        return 15


def _relevance_score(claim: str, snippet: str) -> int:
    if not snippet:
        return 0
    claim_words = {w.lower() for w in re.findall(r"\b\w{3,}\b", claim) if w.lower() not in STOPWORDS}
    snippet_words = {w.lower() for w in re.findall(r"\b\w{3,}\b", snippet) if w.lower() not in STOPWORDS}
    if not claim_words:
        return 15
    ratio = len(claim_words & snippet_words) / len(claim_words)
    return min(30, int(ratio * 45))


def rank_evidence(claim: str, evidence: List[Dict]) -> List[Dict]:
    """Score and sort evidence; return top 5."""
    scored = []
    for item in evidence:
        total = (
            _domain_score(item.get("url", ""))
            + _recency_score(item.get("published_date"))
            + _relevance_score(claim, item.get("snippet", ""))
        )
        scored.append({**item, "trust_score": total})
    scored.sort(key=lambda x: x["trust_score"], reverse=True)
    return scored[:5]
