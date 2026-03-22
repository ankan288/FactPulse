from pydantic import BaseModel
from typing import Optional


class VerifyRequest(BaseModel):
    text: Optional[str] = None
    url: Optional[str] = None


class ExtractURLRequest(BaseModel):
    url: str
