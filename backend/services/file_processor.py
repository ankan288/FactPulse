import logging
import os
import io
import base64
import httpx
import litellm
from pathlib import Path
from typing import Optional
import hashlib
from utils.cache import get_cache

try:
    import pdfplumber
except ImportError:
    pdfplumber = None

try:
    from PIL import Image
    import pytesseract
except ImportError:
    Image = None
    pytesseract = None

logger = logging.getLogger(__name__)

# Temporary upload directory
UPLOAD_DIR = Path("/tmp/gff_uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# Max file size: 10MB
MAX_FILE_SIZE = 10 * 1024 * 1024
ALLOWED_EXTENSIONS = {
    ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".txt",
    ".mp3", ".wav", ".m4a", ".ogg", ".flac",
    ".mp4", ".mov", ".avi", ".mkv", ".webm"
} 


def validate_file(filename: str, file_size: int) -> tuple[bool, str]:
    """Validate file before processing."""
    if file_size > MAX_FILE_SIZE:
        return False, f"File too large. Maximum size: 10MB"
    
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        return False, f"File type not allowed. Supported: {', '.join(ALLOWED_EXTENSIONS)}"
    
    return True, "OK"


import asyncio
import tempfile

async def process_video(file_content: bytes, filename: str) -> Optional[str]:
    """Extract audio from video and process it."""
    import subprocess
    import tempfile
    import os
    
    try:
        # Create temp files for the video and extracted audio
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(filename).suffix) as vid_temp:
            vid_temp.write(file_content)
            vid_temp_path = vid_temp.name
            
        audio_temp_path = vid_temp_path + ".mp3"
        
        # Use simple ffmpeg command to extract audio
        logger.info(f"Extracting audio from video: {filename}...")
        
        # Run ffmpeg synchronously via subprocess (could be async, but quick for small clips)
        cmd = [
            "ffmpeg", "-i", vid_temp_path, 
            "-q:a", "0", "-map", "a", 
            "-y", audio_temp_path
        ]
        
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        await process.communicate()
        
        if not os.path.exists(audio_temp_path):
            logger.warning("Failed to extract audio from video. Proceeding with Vision check.")
            # Fallback to visual check if audio extraction fails
            try:
                os.remove(vid_temp_path)
            except: pass
            return await process_image(file_content, filename)
            
        # Read the extracted audio and pass to audio processor
        with open(audio_temp_path, "rb") as audio_file:
            audio_content = audio_file.read()
            
        # Clean up temp files
        try:
            os.remove(vid_temp_path)
            os.remove(audio_temp_path)
        except: pass
        
        # Pass the extracted audio to the Whisper processor
        return await process_audio(audio_content, filename + ".mp3")
        
    except Exception as e:
        logger.error(f"Video processing error: {e}")
        return None

async def process_pdf(file_content: bytes) -> Optional[str]:
    """Extract and analyze text/facts from PDF file."""
    if not pdfplumber:
        logger.warning("pdfplumber not installed. Skipping PDF processing.")
        return None
    
    try:
        text_parts = []
        pdf_file = io.BytesIO(file_content)
        
        with pdfplumber.open(pdf_file) as pdf:
            for page_num, page in enumerate(pdf.pages):
                try:
                    page_text = page.extract_text()
                    if page_text:
                        text_parts.append(page_text)
                except Exception as e:
                    logger.warning(f"Failed to extract text from PDF page {page_num}: {e}")
                    # Continue with next page
        
        extracted_text = "\n\n".join(text_parts)
        
        if not extracted_text.strip():
            logger.warning("PDF file contained no extractable text")
            return None
        
        # Use LLM to extract the concrete facts and context from the PDF
        gemini_key = os.getenv("GEMINI_API_KEY")
        groq_key = os.getenv("GROQ_API_KEY")
        
        if (gemini_key or groq_key) and extracted_text.strip():
            try:
                model = "gemini/gemini-1.5-flash" if gemini_key else "groq/llama3-8b-8192"
                logger.info(f"Refining PDF text to extract facts using {model}...")
                
                response = await litellm.acompletion(
                    model=model,
                    messages=[
                        {
                            "role": "system",
                            "content": "You are exactly extracting factual claims from documents. Provide just the list of exact facts and claims extracted from the user's text."
                        },
                        {
                            "role": "user",
                            "content": f"Extract all critical facts and context from this PDF text:\n\n{extracted_text[:20000]}"
                        }
                    ]
                )
                refined_text = response.choices[0].message.content
                if refined_text:
                    logger.info(f"Successfully extracted {len(refined_text)} characters of facts from PDF.")
                    return refined_text[:8000]
            except Exception as e:
                logger.warning(f"LLM fact extraction from PDF failed (falling back to raw text): {e}")

        logger.info(f"Extracted {len(extracted_text)} characters from PDF")
        return extracted_text[:8000]  # Limit to 8000 chars like URL scraping
        
    except Exception as e:
        logger.error(f"PDF processing error: {e}")
        return None


async def process_image(file_content: bytes, filename: str) -> Optional[str]:
    """Extract text and facts from image using Vision LLM (fallback to OCR)."""
    # 1. Try Vision LLM (Gemini or Groq)
    gemini_key = os.getenv("GEMINI_API_KEY")
    groq_key = os.getenv("GROQ_API_KEY")
    
    if gemini_key or groq_key:
        try:
            encoded_image = base64.b64encode(file_content).decode("utf-8")
            ext = Path(filename).suffix.lower()
            mime_type = "image/jpeg"
            if ext == ".png": mime_type = "image/png"
            elif ext in [".webp", ".gif"]: mime_type = f"image/{ext[1:]}"
            
            image_url = f"data:{mime_type};base64,{encoded_image}"
            
            # Prefer Gemini for high precision vision if available
            model = "gemini/gemini-1.5-flash" if gemini_key else "groq/llama-3.2-90b-vision-preview"
            
            logger.info(f"Extracting facts from image using Vision LLM: {model}...")
            response = await litellm.acompletion(
                model=model,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "Extract all text, factual claims, and important context from this image. Treat it as if you are preparing claims for a fact-checking pipeline. Output purely the extracted text and facts."},
                            {"type": "image_url", "image_url": {"url": image_url}}
                        ]
                    }
                ]
            )
            extracted_text = response.choices[0].message.content
            if extracted_text and extracted_text.strip():
                logger.info(f"Extracted {len(extracted_text)} characters from image using LLM")
                return extracted_text[:8000]
        except Exception as e:
            logger.warning(f"LLM Image extraction failed, falling back to OCR: {e}")

    # 2. Fallback to OCR
    if not Image or not pytesseract:
        logger.warning("PIL or pytesseract not installed. Skipping image OCR.")
        return None
    
    try:
        image_file = io.BytesIO(file_content)
        image = Image.open(image_file)
        
        # Convert to RGB if needed (for PNG with alpha, etc.)
        if image.mode != "RGB":
            image = image.convert("RGB")
        
        # Extract text using Tesseract OCR
        extracted_text = pytesseract.image_to_string(image)
        
        if not extracted_text.strip():
            logger.warning("Image contained no readable text (OCR failed)")
            return None
        
        logger.info(f"Extracted {len(extracted_text)} characters from image using OCR")
        return extracted_text[:8000]  # Limit to 8000 chars
        
    except Exception as e:
        logger.error(f"Image OCR error: {e}")
        return None


async def process_audio(file_content: bytes, filename: str) -> Optional[str]:
    """Extract text from audio using Groq Whisper model."""
    groq_api_key = os.getenv("GROQ_API_KEY")
    if not groq_api_key:
        logger.warning("GROQ_API_KEY not found. Skipping audio processing.")
        return None
        
    try:
        logger.info(f"Processing audio file {filename} with Groq Whisper...")
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            files = {
                "file": (filename, file_content)
            }
            data = {
                "model": "distil-whisper-large-v3-en"
            }
            
            headers = {"Authorization": f"Bearer {groq_api_key}"}
            
            response = await client.post(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                headers=headers,
                files=files,
                data=data
            )
            
            if response.status_code != 200:
                logger.error(f"Groq Audio API error: {response.text}")
                return None
                
            result = response.json()
            extracted_text = result.get("text", "")
            
            if not extracted_text.strip():
                logger.warning("Audio contained no speech (Empty result)")
                return None
                
            logger.info(f"Extracted {len(extracted_text)} characters from audio")
            return extracted_text[:8000]
            
    except Exception as e:
        logger.error(f"Audio processing error: {e}")
        return None


async def process_text_file(file_content: bytes) -> Optional[str]:
    """Extract text from plain text file."""
    try:
        text = file_content.decode("utf-8", errors="ignore")
        
        if not text.strip():
            logger.warning("Text file is empty")
            return None
        
        logger.info(f"Extracted {len(text)} characters from text file")
        return text[:8000]  # Limit to 8000 chars
        
    except Exception as e:
        logger.error(f"Text file processing error: {e}")
        return None


async def process_file(filename: str, file_content: bytes) -> Optional[str]:
    """Main file processor router."""
    # Validate file
    is_valid, message = validate_file(filename, len(file_content))
    if not is_valid:
        logger.warning(f"File validation failed: {message}")
        return None
    
    ext = Path(filename).suffix.lower()
    
    # ── Check Redis caching layer for heavy media files ──
    file_hash = hashlib.sha256(file_content).hexdigest()
    cache = get_cache()
    cached_result = cache.get_file_cache(file_hash)
    if cached_result:
        logger.info(f"Using cached extraction for {filename}")
        return cached_result
    
    logger.info(f"Processing file: {filename} ({len(file_content)} bytes)")
    
    extracted_text = None
    if ext == ".pdf":
        extracted_text = await process_pdf(file_content)
    
    elif ext in {".jpg", ".jpeg", ".png", ".gif", ".webp"}:
        extracted_text = await process_image(file_content, filename)
        
    elif ext in {".mp3", ".wav", ".m4a", ".ogg", ".flac"}:
        extracted_text = await process_audio(file_content, filename)
        
    elif ext in {".mp4", ".mov", ".avi", ".mkv", ".webm"}:
        extracted_text = await process_video(file_content, filename)
    
    elif ext == ".txt":
        extracted_text = await process_text_file(file_content)
    
    else:
        logger.warning(f"Unsupported file extension: {ext}")
        return None

    if extracted_text:
        cache.set_file_cache(file_hash, extracted_text)
        
    return extracted_text
