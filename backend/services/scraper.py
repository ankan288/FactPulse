import httpx
from bs4 import BeautifulSoup
from typing import Dict


class ScraperException(Exception):
    pass


async def scrape_url(url: str) -> Dict:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
    except httpx.TimeoutException:
        raise ScraperException("Request timed out. The site may be too slow or blocking bots.")
    except httpx.HTTPStatusError as e:
        code = e.response.status_code
        if code == 403:
            raise ScraperException("Access denied (403). Try pasting the article text directly.")
        elif code == 404:
            raise ScraperException("Page not found (404).")
        else:
            raise ScraperException(f"HTTP error {code}.")
    except Exception as e:
        raise ScraperException(f"Could not fetch the URL: {e}")

    soup = BeautifulSoup(response.text, "html.parser")

    # Remove noise elements
    for tag in soup(["script", "style", "nav", "footer", "header", "aside", "form", "iframe", "noscript"]):
        tag.decompose()

    # Extract title
    title = ""
    if soup.find("h1"):
        title = soup.find("h1").get_text(strip=True)
    elif soup.find("title"):
        title = soup.find("title").get_text(strip=True)

    # Try semantic tags first, then fall back to body
    content = (
        soup.find("article")
        or soup.find("main")
        or soup.find("div", {"class": lambda c: c and any(
            k in " ".join(c) if isinstance(c, list) else k in c
            for k in ["article", "content", "post", "story", "body"]
        )})
        or soup.body
    )

    if not content:
        raise ScraperException("Could not extract article content from this page.")

    paragraphs = content.find_all("p")
    text = " ".join(p.get_text(strip=True) for p in paragraphs if len(p.get_text(strip=True)) > 30)

    if len(text) < 100:
        text = content.get_text(separator=" ", strip=True)

    if len(text) < 50:
        raise ScraperException(
            "Not enough readable text found. Try pasting the article text directly."
        )

    return {"title": title, "text": text[:8000], "source_url": url}
