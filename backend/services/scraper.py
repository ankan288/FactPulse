import re
from urllib.parse import urlparse, urljoin, unquote

import httpx
from bs4 import BeautifulSoup
from typing import Dict


class ScraperException(Exception):
    pass


def _wikipedia_title(url: str) -> str | None:
    """Return the Wikipedia article title if the URL is a Wikipedia page, else None."""
    parsed = urlparse(url)
    if "wikipedia.org" in parsed.netloc and parsed.path.startswith("/wiki/"):
        title = parsed.path[len("/wiki/"):]
        # Strip anchor
        title = title.split("#")[0]
        return unquote(title) if title else None
    return None


async def _scrape_wikipedia(title: str, url: str) -> Dict:
    """Fetch a Wikipedia article via the official REST API — no 403 issues."""
    encoded = title.replace(" ", "_")
    api_base = f"https://en.wikipedia.org/api/rest_v1/page"
    headers = {"User-Agent": "FactPulse/2.0 (fact-checking research tool; contact@factpulse.dev)"}

    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        # Summary endpoint — fast, always works
        try:
            summary_resp = await client.get(f"{api_base}/summary/{encoded}", headers=headers)
            summary_resp.raise_for_status()
            summary_data = summary_resp.json()
        except Exception as e:
            raise ScraperException(f"Wikipedia API error: {e}")

        article_title = summary_data.get("title", title)
        extract = summary_data.get("extract", "")
        thumbnail = summary_data.get("thumbnail", {}).get("source", "")

        # Full sections endpoint — provides much more text for fact-checking
        try:
            sections_resp = await client.get(f"{api_base}/mobile-sections/{encoded}", headers=headers)
            if sections_resp.status_code == 200:
                sections_data = sections_resp.json()
                lead_html = sections_data.get("lead", {}).get("sections", [{}])[0].get("text", "")
                other_sections = sections_data.get("remaining", {}).get("sections", [])
                all_html = lead_html + " ".join(s.get("text", "") for s in other_sections[:10])
                soup = BeautifulSoup(all_html, "html.parser")
                full_text = soup.get_text(separator=" ", strip=True)
                text = full_text[:8000] if len(full_text) > len(extract) else extract
            else:
                text = extract
        except Exception:
            text = extract

    if len(text) < 50:
        raise ScraperException("Wikipedia article has no readable content.")

    images = []
    if thumbnail:
        images.append({"url": thumbnail, "caption": article_title, "context": "Wikipedia article thumbnail"})

    return {
        "title": article_title,
        "text": text[:8000],
        "source_url": url,
        "images": images,
    }


async def scrape_url(url: str) -> Dict:
    # ── Wikipedia fast-path (uses official REST API — no 403) ─────────────
    wiki_title = _wikipedia_title(url)
    if wiki_title:
        return await _scrape_wikipedia(wiki_title, url)

    # ── Generic scraper for all other URLs ────────────────────────────────
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

    # ── Extract Images for Multimodal Verification ───────────────
    images_data = []
    
    og_image = soup.find("meta", property="og:image")
    if og_image and og_image.get("content"):
        images_data.append({
            "url": og_image["content"],
            "caption": title,
            "context": "Main OpenGraph Image"
        })

    if content_body := (content if content else soup):
        for img in content_body.find_all("img"):
            src = img.get("src") or img.get("data-src")
            if not src:
                continue
            
            # Filter data URIs and assumed icons/logos
            src_lower = src.lower()
            if src_lower.startswith("data:image"):
                continue
            if any(skip in src_lower for skip in ["logo", "icon", "spinner", "avatar", "1x1", "tracking"]):
                continue
            
            # Filter by inline dimensions if available
            try:
                w_attr = img.get("width")
                h_attr = img.get("height")
                if w_attr and h_attr:
                    w = int(w_attr.replace("px", "").strip())
                    h = int(h_attr.replace("px", "").strip())
                    if w < 150 or h < 150: # Skip small images
                        continue
            except Exception:
                pass

            alt_text = img.get("alt", "").strip()
            
            # Try to get figcaption
            figure = img.find_parent("figure")
            caption = ""
            if figure:
                fc = figure.find("figcaption")
                if fc:
                    caption = fc.get_text(strip=True)
            
            # Fallback context: surrounding text
            context = ""
            parent = img.find_parent(["p", "div"])
            if parent:
                parent_text = parent.get_text(strip=True)
                # Ensure we don't just grab the alt text again
                if len(parent_text) > len(alt_text) + 20: 
                    context = parent_text[:200]

            images_data.append({
                "url": url if src.startswith("/") else src, # Basic relative resolution 
                "caption": caption or alt_text,
                "context": context or title
            })
            
            # Limit to max 5 images to prevent rate limit blows
            if len(images_data) >= 5:
                break
                
    # Basic deduplication by URL
    seen_urls = set()
    unique_images = []
    for img in images_data:
        # handle absolute URL conversion
        if img["url"].startswith("//"):
            img["url"] = "https:" + img["url"]
        elif img["url"].startswith("/"):
            from urllib.parse import urljoin
            img["url"] = urljoin(url, img["url"])
            
        if img["url"] not in seen_urls:
            seen_urls.add(img["url"])
            unique_images.append(img)
    
    return {
        "title": title, 
        "text": text[:8000], 
        "source_url": url,
        "images": unique_images[:5]
    }
