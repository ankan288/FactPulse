"""
Custom exception and error handling utilities for the verification API.
"""

import logging
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

logger = logging.getLogger(__name__)


class VerificationError(Exception):
    """Base exception for verification pipeline errors."""
    def __init__(self, message: str, code: int = 500):
        self.message = message
        self.code = code
        super().__init__(self.message)


class InvalidInputError(VerificationError):
    """Raised when input validation fails."""
    def __init__(self, message: str):
        super().__init__(message, code=400)


class SearchError(VerificationError):
    """Raised when evidence search fails."""
    def __init__(self, message: str):
        super().__init__(message, code=503)


class LLMError(VerificationError):
    """Raised when LLM API calls fail."""
    def __init__(self, message: str):
        super().__init__(message, code=503)


class MediaAnalysisError(VerificationError):
    """Raised when media analysis fails (non-critical)."""
    def __init__(self, message: str):
        super().__init__(message, code=503)


class RateLimitError(VerificationError):
    """Raised when rate limit is exceeded."""
    def __init__(self, message: str, retry_after: int = 60):
        super().__init__(message, code=429)
        self.retry_after = retry_after


class FileProcessingError(VerificationError):
    """Raised when file upload/processing fails."""
    def __init__(self, message: str):
        super().__init__(message, code=400)


async def verification_error_handler(request: Request, exc: VerificationError) -> JSONResponse:
    """Handle VerificationError exceptions."""
    logger.error(f"Verification error: {exc.message}", exc_info=exc)
    
    response = {
        "error": exc.message,
        "status": "error",
    }
    
    # Add rate limit headers if applicable
    headers = {}
    if isinstance(exc, RateLimitError):
        headers["Retry-After"] = str(exc.retry_after)
    
    return JSONResponse(
        status_code=exc.code,
        content=response,
        headers=headers,
    )


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Handle Pydantic validation errors."""
    logger.warning(f"Validation error: {exc}")
    
    return JSONResponse(
        status_code=400,
        content={
            "error": "Invalid request. Please check your input.",
            "status": "error",
            "details": [
                {
                    "field": ".".join(str(x) for x in error["loc"][1:]),
                    "message": error["msg"],
                }
                for error in exc.errors()
            ],
        },
    )


async def generic_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle unexpected exceptions."""
    logger.error(f"Unexpected error: {exc}", exc_info=exc)
    
    return JSONResponse(
        status_code=500,
        content={
            "error": "An unexpected error occurred. Please try again later.",
            "status": "error",
        },
    )
