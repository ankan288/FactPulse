import asyncio
import base64
import json
import logging
import os
import re
from typing import List, Dict, Any

import httpx
import litellm

logger = logging.getLogger(__name__)

LLM_TIMEOUT = 30.0
HTTP_TIMEOUT = 10.0

async def _fetch_image_base64(client: httpx.AsyncClient, url: str) -> str:
    """Fetch an image from a URL and return it as a base64 data URI."""
    try:
        response = await client.get(url, timeout=HTTP_TIMEOUT)
        response.raise_for_status()
        
        content_type = response.headers.get("Content-Type", "").lower()
        if not content_type.startswith("image/"):
            # Best guess fallback
            if url.lower().endswith(".png"): content_type = "image/png"
            elif url.lower().endswith(".webp"): content_type = "image/webp"
            else: content_type = "image/jpeg"
            
        b64_data = base64.b64encode(response.content).decode("utf-8")
        return f"data:{content_type};base64,{b64_data}"
    except Exception as e:
        logger.warning(f"Failed to fetch image {url}: {e}")
        return ""

async def _analyze_single_image(img_data: Dict, client: httpx.AsyncClient) -> Dict[str, Any]:
    """Analyze a single image using Gemini Multimodal."""
    url = img_data.get("url")
    context = img_data.get("context", "")
    caption = img_data.get("caption", "")
    
    result = {
        "url": url,
        "ai_probability": 0,
        "label": "ERROR",
        "reasoning": "Analysis failed",
        "caption": caption
    }

    if not url:
        return result

    b64_uri = await _fetch_image_base64(client, url)
    if not b64_uri:
        result["reasoning"] = "Failed to download image from source."
        return result
        
    prompt = f"""You are a digital forensics expert acting as part of a misinformation detection pipeline. 
Analyze the provided image for signs of AI-generation or synthetic manipulation (deepfakes).
Pay attention to:
- Unnatural artifacts, extra/missing fingers, bizarre textures.
- Nonsensical background text or logic.
- Inconsistent lighting or extreme smoothness.

Surrounding context from the article: "{context}"
Image caption from the article: "{caption}"

Output ONLY a raw valid JSON object (no markdown formatting, no code blocks) with the following structure:
{{
  "ai_probability": (number between 0 and 100),
  "label": (one of: "LIKELY_REAL", "AI_ASSISTED", "LIKELY_AI_GENERATED"),
  "reasoning": "Detailed explanation of exactly what visual features led to this conclusion."
}}
"""

    gemini_key = os.getenv("GEMINI_API_KEY")
    if not gemini_key:
        result["reasoning"] = "GEMINI_API_KEY not configured. Multimodal analysis requires Gemini."
        return result

    try:
        loop = asyncio.get_event_loop()
        response = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                lambda: litellm.completion(
                    model="gemini/gemini-1.5-flash-latest",
                    messages=[
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": prompt},
                                {"type": "image_url", "image_url": {"url": b64_uri}}
                            ]
                        }
                    ],
                    api_key=gemini_key,
                    temperature=0.1,
                    max_tokens=600,
                ),
            ),
            timeout=LLM_TIMEOUT,
        )
        
        raw = response.choices[0].message.content.strip()
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        
        analysis = json.loads(raw)
        
        # Merge results
        ai_prob = max(0, min(100, int(analysis.get("ai_probability", 0))))
        label = analysis.get("label", "LIKELY_REAL")
        
        # Heuristic adjustment based on metadata/context
        # If the caption explicitly says "AI generated", bump the score
        if "ai generated" in caption.lower() or "midjourney" in caption.lower() or "dall-e" in caption.lower():
            ai_prob = max(ai_prob, 90)
            label = "LIKELY_AI_GENERATED"
            
        result.update({
            "ai_probability": ai_prob,
            "label": label,
            "reasoning": analysis.get("reasoning", "No detailed reasoning provided.")
        })
        
    except Exception as e:
        logger.error(f"Media analysis failed for {url}: {e}")
        result["reasoning"] = f"Verification failed: {e}"

    return result

async def detect_media(images_data: List[Dict]) -> List[Dict]:
    """Concurrently process a list of scraped images for AI detection."""
    if not images_data:
        return []
        
    # Limit to maximum 3 images to prevent overwhelming rate limits and timeout
    images_to_process = images_data[:3]
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36"
    }
    
    async with httpx.AsyncClient(headers=headers, follow_redirects=True) as client:
        tasks = [_analyze_single_image(img, client) for img in images_to_process]
        results = await asyncio.gather(*tasks, return_exceptions=False)
        
    return list(results)
