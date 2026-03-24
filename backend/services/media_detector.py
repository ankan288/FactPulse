import asyncio
import base64
import json
import logging
import os
from typing import List, Dict, Any

import httpx

logger = logging.getLogger(__name__)

HTTP_TIMEOUT = 10.0
SIGHTENGINE_API_URL = "https://api.sightengine.com/1.0/check.json"

async def _analyze_single_image(img_data: Dict, client: httpx.AsyncClient, api_key: str) -> Dict[str, Any]:
    """Analyze a single image using Sightengine API for deepfake detection."""
    url = img_data.get("url")
    caption = img_data.get("caption", "")
    
    result = {
        "url": url,
        "ai_probability": 0,
        "label": "LIKELY_REAL",
        "reasoning": "Unable to analyze image.",
        "caption": caption
    }

    if not url:
        return result

    try:
        # Call Sightengine API with the image URL
        params = {
            "image": url,
            "models": "deepfake,properties",  # Check for deepfakes and general properties
            "api_user": api_key.split(":")[0] if ":" in api_key else "api",
            "api_secret": api_key,
        }
        
        response = await client.get(
            SIGHTENGINE_API_URL,
            params=params,
            timeout=HTTP_TIMEOUT
        )
        response.raise_for_status()
        
        data = response.json()
        
        if data.get("status") == "success":
            # Extract deepfake probability
            deepfake_score = data.get("deepfake", {}).get("score", 0)
            ai_probability = int(deepfake_score * 100)
            
            # Determine label based on score
            if ai_probability >= 70:
                label = "LIKELY_AI_GENERATED"
            elif ai_probability >= 40:
                label = "AI_ASSISTED"
            else:
                label = "LIKELY_REAL"
            
            reasoning = f"Deepfake probability: {ai_probability}%. "
            
            # Add additional context from properties
            properties = data.get("properties", {})
            if properties.get("text_detection"):
                reasoning += "Text detected in image. "
            if properties.get("object_detection"):
                reasoning += "Multiple objects detected. "
                
            result.update({
                "ai_probability": ai_probability,
                "label": label,
                "reasoning": reasoning
            })
        else:
            error_msg = data.get("error", {}).get("message", "Unknown error")
            result["reasoning"] = f"Sightengine analysis error: {error_msg}"
            
    except Exception as e:
        logger.error(f"Media analysis failed for {url}: {e}")
        result["reasoning"] = f"Analysis failed: {str(e)}"
    
    return result


async def detect_media(images_data: List[Dict]) -> List[Dict]:
    """Concurrently process a list of scraped images for AI detection using Sightengine."""
    if not images_data:
        return []
    
    # Get Sightengine API key
    api_key = os.getenv("SIGHTENGINE_API_KEY")
    if not api_key:
        logger.info("SIGHTENGINE_API_KEY not configured. Skipping media detection.")
        return []
        
    # Limit to maximum 3 images to prevent overwhelming rate limits and timeout
    images_to_process = images_data[:3]
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36"
    }
    
    async with httpx.AsyncClient(headers=headers, follow_redirects=True) as client:
        tasks = [_analyze_single_image(img, client, api_key) for img in images_to_process]
        results = await asyncio.gather(*tasks, return_exceptions=False)
        
    return list(results)
