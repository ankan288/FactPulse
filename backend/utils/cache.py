"""Redis caching utilities for claim verification results."""

import hashlib
import json
import logging
from typing import Dict, Optional

try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False

logger = logging.getLogger(__name__)


class ClaimCache:
    """Cache for verified claim results using Redis."""

    def __init__(self, host: str = 'localhost', port: int = 6379, db: int = 0):
        """Initialize Redis cache connection.

        Args:
            host: Redis server host
            port: Redis server port
            db: Redis database number
        """
        self.enabled = REDIS_AVAILABLE
        self.client = None

        if not REDIS_AVAILABLE:
            logger.warning(
                "Redis not available - caching disabled. "
                "Install redis package for caching: pip install redis"
            )
            return

        try:
            self.client = redis.Redis(
                host=host,
                port=port,
                db=db,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2
            )
            # Test connection
            self.client.ping()
            logger.info("Redis cache initialized successfully at %s:%d", host, port)
        except redis.ConnectionError as e:
            logger.warning(
                "Redis connection failed - caching disabled: %s. "
                "Start Redis server or check connection settings.", e
            )
            self.enabled = False
            self.client = None
        except Exception as e:
            logger.error("Redis initialization error - caching disabled: %s", e)
            self.enabled = False
            self.client = None

    def _hash_claim(self, claim: str) -> str:
        """Generate a consistent hash key for a claim.

        Args:
            claim: The claim text to hash

        Returns:
            SHA256 hash of the normalized claim
        """
        # Normalize claim: lowercase, strip whitespace, remove punctuation
        normalized = claim.lower().strip().rstrip('.!?')
        return hashlib.sha256(normalized.encode('utf-8')).hexdigest()

    def get(self, claim: str) -> Optional[Dict]:
        """Retrieve cached verification result for a claim.

        Args:
            claim: The claim text to lookup

        Returns:
            Cached verification result dict, or None if not found or cache disabled
        """
        if not self.enabled or not self.client:
            return None

        try:
            key = f"claim:{self._hash_claim(claim)}"
            cached = self.client.get(key)

            if cached:
                logger.info("Cache HIT for claim: %.50s...", claim)
                return json.loads(cached)
            else:
                logger.debug("Cache MISS for claim: %.50s...", claim)
                return None

        except redis.RedisError as e:
            logger.warning("Redis get error: %s", e)
            return None
        except json.JSONDecodeError as e:
            logger.warning("Cache data corrupted: %s", e)
            return None
        except Exception as e:
            logger.error("Unexpected cache get error: %s", e)
            return None

    def set(self, claim: str, result: Dict, ttl: int = 86400) -> bool:
        """Cache a verification result for a claim.

        Args:
            claim: The claim text
            result: The verification result dict to cache
            ttl: Time-to-live in seconds (default: 24 hours)

        Returns:
            True if cached successfully, False otherwise
        """
        if not self.enabled or not self.client:
            return False

        try:
            key = f"claim:{self._hash_claim(claim)}"
            value = json.dumps(result)

            self.client.setex(key, ttl, value)
            logger.info("Cached result for claim: %.50s... (TTL: %ds)", claim, ttl)
            return True

        except redis.RedisError as e:
            logger.warning("Redis set error: %s", e)
            return False
        except TypeError as e:
            logger.warning("Result not JSON serializable: %s", e)
            return False
        except Exception as e:
            logger.error("Unexpected cache set error: %s", e)
            return False

    def delete(self, claim: str) -> bool:
        """Delete cached result for a claim.

        Args:
            claim: The claim text

        Returns:
            True if deleted successfully, False otherwise
        """
        if not self.enabled or not self.client:
            return False

        try:
            key = f"claim:{self._hash_claim(claim)}"
            deleted = self.client.delete(key)
            if deleted:
                logger.info("Deleted cache for claim: %.50s...", claim)
            return bool(deleted)

        except redis.RedisError as e:
            logger.warning("Redis delete error: %s", e)
            return False
        except Exception as e:
            logger.error("Unexpected cache delete error: %s", e)
            return False

    def clear_all(self) -> bool:
        """Clear all cached claims (use with caution).

        Returns:
            True if successful, False otherwise
        """
        if not self.enabled or not self.client:
            return False

        try:
            keys = self.client.keys("claim:*")
            if keys:
                self.client.delete(*keys)
                logger.info("Cleared %d cached claims", len(keys))
            return True

        except redis.RedisError as e:
            logger.warning("Redis clear error: %s", e)
            return False
        except Exception as e:
            logger.error("Unexpected cache clear error: %s", e)
            return False

    def get_file_cache(self, file_hash: str) -> Optional[str]:
        """Retrieve cached text extraction from a file hash."""
        if not self.enabled or not self.client:
            return None
        try:
            cached = self.client.get(f"file:ext:{file_hash}")
            if cached:
                logger.info(f"File cache HIT for hash: {file_hash[:8]}...")
                return cached
            return None
        except: return None
        
    def set_file_cache(self, file_hash: str, extracted_text: str, ttl: int = 86400 * 7):
        """Cache extracted text for a specific file hash (7 days TTL)."""
        if not self.enabled or not self.client:
            return False
        try:
            self.client.setex(f"file:ext:{file_hash}", ttl, extracted_text)
            logger.info(f"Cached file extraction for hash: {file_hash[:8]}...")
            return True
        except: return False

    def get_stats(self) -> Optional[Dict]:
        """Get cache statistics.

        Returns:
            Dict with cache stats, or None if cache disabled
        """
        if not self.enabled or not self.client:
            return None

        try:
            keys = self.client.keys("claim:*")
            info = self.client.info('stats')

            return {
                "enabled": True,
                "total_claims_cached": len(keys),
                "keyspace_hits": info.get('keyspace_hits', 0),
                "keyspace_misses": info.get('keyspace_misses', 0),
            }

        except redis.RedisError as e:
            logger.warning("Redis stats error: %s", e)
            return {"enabled": False, "error": str(e)}
        except Exception as e:
            logger.error("Unexpected cache stats error: %s", e)
            return {"enabled": False, "error": str(e)}


# Global cache instance (initialized when main.py imports this)
_global_cache: Optional[ClaimCache] = None


def get_cache(
    host: str = 'localhost',
    port: int = 6379,
    db: int = 0
) -> ClaimCache:
    """Get or create the global cache instance.

    Args:
        host: Redis server host
        port: Redis server port
        db: Redis database number

    Returns:
        ClaimCache instance
    """
    global _global_cache

    if _global_cache is None:
        _global_cache = ClaimCache(host=host, port=port, db=db)

    return _global_cache
