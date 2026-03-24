import logging
import os
import io
from pathlib import Path
from typing import Optional

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
ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".txt"}


def validate_file(filename: str, file_size: int) -> tuple[bool, str]:
    """Validate file before processing."""
    if file_size > MAX_FILE_SIZE:
        return False, f"File too large. Maximum size: 10MB"
    
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        return False, f"File type not allowed. Supported: {', '.join(ALLOWED_EXTENSIONS)}"
    
    return True, "OK"


async def process_pdf(file_content: bytes) -> Optional[str]:
    """Extract text from PDF file."""
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
        
        logger.info(f"Extracted {len(extracted_text)} characters from PDF")
        return extracted_text[:8000]  # Limit to 8000 chars like URL scraping
        
    except Exception as e:
        logger.error(f"PDF processing error: {e}")
        return None


async def process_image(file_content: bytes) -> Optional[str]:
    """Extract text from image using OCR."""
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
    
    logger.info(f"Processing file: {filename} ({len(file_content)} bytes)")
    
    if ext == ".pdf":
        return await process_pdf(file_content)
    
    elif ext in {".jpg", ".jpeg", ".png", ".gif", ".webp"}:
        return await process_image(file_content)
    
    elif ext == ".txt":
        return await process_text_file(file_content)
    
    else:
        logger.warning(f"Unsupported file extension: {ext}")
        return None
