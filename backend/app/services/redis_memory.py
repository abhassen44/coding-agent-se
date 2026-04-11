"""
Tier 1 — Hot Memory: Redis sliding-window session buffer.

Stores the last N messages per active conversation in Redis with a TTL.
Sub-millisecond reads. Falls back to Postgres on cache miss.
"""
import json
import logging
from typing import Optional

import redis.asyncio as aioredis

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class RedisMemory:
    """Sliding-window message buffer backed by Redis."""

    SESSION_TTL = 7200   # 2 hours
    MAX_MESSAGES = 15    # Keep at most this many messages per conversation

    def __init__(self, redis_url: Optional[str] = None):
        url = redis_url or get_settings().redis_url
        self._redis: Optional[aioredis.Redis] = None
        self._url = url

    async def _get_redis(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = aioredis.from_url(self._url, decode_responses=True)
        return self._redis

    def _key(self, conversation_id: int) -> str:
        return f"conv:{conversation_id}:messages"

    # ── Write ────────────────────────────────────────────────────

    async def push_message(
        self,
        conversation_id: int,
        role: str,
        content: str,
        metadata: Optional[dict] = None,
    ) -> None:
        """Append a message to the sliding window."""
        try:
            r = await self._get_redis()
            key = self._key(conversation_id)
            msg = json.dumps({"role": role, "content": content, "metadata": metadata or {}})
            await r.rpush(key, msg)
            await r.ltrim(key, -self.MAX_MESSAGES, -1)  # Keep only last N
            await r.expire(key, self.SESSION_TTL)
        except Exception as e:
            logger.warning(f"Redis push_message failed (non-fatal): {e}")

    # ── Read ─────────────────────────────────────────────────────

    async def get_messages(self, conversation_id: int) -> list[dict]:
        """Get all messages currently in the buffer. Returns [] on miss."""
        try:
            r = await self._get_redis()
            key = self._key(conversation_id)
            raw = await r.lrange(key, 0, -1)
            return [json.loads(m) for m in raw] if raw else []
        except Exception as e:
            logger.warning(f"Redis get_messages failed (non-fatal): {e}")
            return []

    # ── Clear ────────────────────────────────────────────────────

    async def clear(self, conversation_id: int) -> None:
        """Delete the session buffer for a conversation."""
        try:
            r = await self._get_redis()
            await r.delete(self._key(conversation_id))
        except Exception as e:
            logger.warning(f"Redis clear failed (non-fatal): {e}")

    # ── Cleanup ──────────────────────────────────────────────────

    async def close(self) -> None:
        if self._redis:
            await self._redis.close()
            self._redis = None


# ── Singleton ────────────────────────────────────────────────────
_redis_memory: Optional[RedisMemory] = None


def get_redis_memory() -> RedisMemory:
    """Get or create the Redis memory singleton."""
    global _redis_memory
    if _redis_memory is None:
        _redis_memory = RedisMemory()
    return _redis_memory
