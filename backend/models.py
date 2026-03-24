from pydantic import BaseModel, validator, HttpUrl, Field
from typing import Optional


class VerifyRequest(BaseModel):
    text: Optional[str] = Field(None, min_length=3, max_length=50000, description="Plain text to verify")
    url: Optional[str] = Field(None, description="URL of article to verify")

    @validator("text", "url", pre=True)
    def empty_string_to_none(cls, v):
        """Convert empty strings to None."""
        if isinstance(v, str) and not v.strip():
            return None
        return v

    @validator("text", "url")
    def at_least_one_required(cls, v, values):
        """Ensure at least one of text or url is provided."""
        if v is None and values.get("text") is None and values.get("url") is None:
            raise ValueError("Either 'text' or 'url' must be provided")
        return v

    class Config:
        example = {
            "text": "The capital of France is Paris and it is known for the Eiffel Tower.",
            "url": "https://example.com/article"
        }


class ExtractURLRequest(BaseModel):
    url: str = Field(..., description="URL to extract content from")

    @validator("url")
    def validate_url(cls, v):
        """Validate URL format."""
        if not v.strip():
            raise ValueError("URL cannot be empty")
        if not (v.startswith("http://") or v.startswith("https://") or v.startswith("www.")):
            raise ValueError("URL must start with http://, https://, or www.")
        if len(v) > 2000:
            raise ValueError("URL is too long")
        return v.strip()

    class Config:
        example = {"url": "https://example.com/article"}

