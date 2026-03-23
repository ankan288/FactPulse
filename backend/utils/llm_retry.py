"""LLM API retry logic with exponential backoff for rate limit handling."""

import asyncio
import logging
from typing import Any, Dict, List
from functools import wraps

logger = logging.getLogger(__name__)


class RateLimitError(Exception):
    """Custom exception for rate limit errors."""
    pass


def is_rate_limit_error(exception: Exception) -> bool:
    """Check if an exception is a rate limit error."""
    error_str = str(exception).lower()
    error_type = type(exception).__name__.lower()

    # Check for common rate limit indicators
    rate_limit_indicators = [
        "429",
        "rate limit",
        "ratelimit",
        "too many requests",
        "quota exceeded",
        "rate_limit_error"
    ]

    return any(indicator in error_str or indicator in error_type
               for indicator in rate_limit_indicators)


def retry_on_rate_limit(max_attempts: int = 3, base_delay: float = 2.0):
    """
    Decorator to retry async LLM calls with exponential backoff on rate limit errors.

    Args:
        max_attempts: Maximum number of retry attempts (default: 3)
        base_delay: Base delay in seconds for exponential backoff (default: 2.0)
                   Delays will be: 2s, 4s, 8s

    Usage:
        @retry_on_rate_limit(max_attempts=3, base_delay=2.0)
        async def my_llm_call():
            return await llm_client.chat(...)
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            last_exception = None

            for attempt in range(1, max_attempts + 1):
                try:
                    return await func(*args, **kwargs)

                except Exception as e:
                    last_exception = e

                    # Check if it's a rate limit error
                    if is_rate_limit_error(e):
                        if attempt < max_attempts:
                            # Calculate exponential backoff delay
                            delay = base_delay * (2 ** (attempt - 1))

                            logger.warning(
                                f"Rate limit hit in {func.__name__} "
                                f"(attempt {attempt}/{max_attempts}). "
                                f"Retrying in {delay}s... Error: {e}"
                            )

                            await asyncio.sleep(delay)
                            continue
                        else:
                            logger.error(
                                f"Rate limit in {func.__name__} - "
                                f"max retries ({max_attempts}) exceeded. "
                                f"Error: {e}"
                            )
                            raise RateLimitError(
                                f"Rate limit exceeded after {max_attempts} attempts: {e}"
                            ) from e
                    else:
                        # Not a rate limit error, re-raise immediately
                        logger.error(f"Non-rate-limit error in {func.__name__}: {e}")
                        raise

            # Should never reach here, but just in case
            raise last_exception

        return wrapper
    return decorator


async def call_llm_with_retry(
    llm_client: Any,
    model: str,
    messages: List[Dict[str, str]],
    max_attempts: int = 3,
    base_delay: float = 2.0,
    **kwargs
) -> Any:
    """
    Call LLM API with automatic retry on rate limit errors.

    Args:
        llm_client: The LLM client instance (e.g., litellm)
        model: Model name to use
        messages: List of message dicts for the chat
        max_attempts: Maximum retry attempts (default: 3)
        base_delay: Base delay for exponential backoff (default: 2.0s)
        **kwargs: Additional parameters to pass to the LLM

    Returns:
        LLM response object

    Raises:
        RateLimitError: If rate limit persists after all retries
        Exception: For other errors

    Example:
        response = await call_llm_with_retry(
            llm_client=litellm,
            model="nvidia-llama-3.1-8b",
            messages=[{"role": "user", "content": "Hello"}],
            temperature=0.2
        )
    """
    last_exception = None

    for attempt in range(1, max_attempts + 1):
        try:
            # Attempt the LLM call
            response = await llm_client.acompletion(
                model=model,
                messages=messages,
                **kwargs
            )
            return response

        except Exception as e:
            last_exception = e

            # Check if it's a rate limit error
            if is_rate_limit_error(e):
                if attempt < max_attempts:
                    # Calculate exponential backoff delay
                    delay = base_delay * (2 ** (attempt - 1))

                    logger.warning(
                        f"Rate limit hit for model {model} "
                        f"(attempt {attempt}/{max_attempts}). "
                        f"Retrying in {delay}s... Error: {e}"
                    )

                    await asyncio.sleep(delay)
                    continue
                else:
                    logger.error(
                        f"Rate limit for model {model} - "
                        f"max retries ({max_attempts}) exceeded. "
                        f"Error: {e}"
                    )
                    raise RateLimitError(
                        f"Rate limit exceeded after {max_attempts} attempts: {e}"
                    ) from e
            else:
                # Not a rate limit error, re-raise immediately
                logger.error(f"Non-rate-limit error calling {model}: {e}")
                raise

    # Should never reach here, but just in case
    raise last_exception
