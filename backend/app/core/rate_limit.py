"""Small in-process rate limiter used by the API middleware.

This is intentionally dependency-free. It is per-worker, which is sufficient for
the local/single-instance deployment this project targets. Swap in Redis if the
backend is ever scaled horizontally.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.config import get_settings
from app.core.security import decode_token

settings = get_settings()

# path -> (max requests, window seconds)
RULES: dict[str, tuple[int, int]] = {
    # Auth limits are per IP, so keep them high enough for a shared NAT
    # (e.g. a campus network) while still slowing brute-force attempts.
    "/api/v1/auth/login": (30, 60),
    "/api/v1/auth/register": (20, 300),
    "/api/v1/agent/stream": (20, 60),
    "/api/v1/execute/run": (30, 60),
    "/api/v1/chat/message": (30, 60),
    "/api/v1/chat/stream": (30, 60),
    "/api/v1/chat/generate": (20, 60),
    "/api/v1/chat/explain": (20, 60),
    "/api/v1/chat/debug": (20, 60),
    "/api/v1/repo/import": (3, 3600),
    "/api/v1/files/upload": (20, 3600),
    "/api/v1/files/extract-text": (20, 3600),
    "/api/v1/workspace/create": (6, 3600),
}


def get_rule(path: str) -> tuple[int, int] | None:
    """Return the rate-limit rule for a request path."""
    rule = RULES.get(path)
    if rule:
        return rule
    if path.startswith("/api/v1/repo/") and path.endswith("/reindex"):
        return 3, 3600
    return None


def _request_key(request: Request) -> str:
    """Prefer the authenticated user; fall back to client IP."""
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        payload = decode_token(auth[7:])
        if payload and payload.get("type") == "access" and payload.get("sub"):
            return f"user:{payload['sub']}:{request.url.path}"
    client = request.client.host if request.client else "unknown"
    return f"ip:{client}:{request.url.path}"


class RateLimiter:
    """Sliding-window counters keyed by client + route."""

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str, limit: int, window: int) -> tuple[bool, int]:
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] > window:
            hits.popleft()
        if len(hits) >= limit:
            retry_after = max(1, int(window - (now - hits[0])))
            return False, retry_after
        hits.append(now)
        return True, 0


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Apply stricter limits to auth, agent streaming, and execution endpoints."""

    def __init__(self, app) -> None:
        super().__init__(app)
        self.limiter = RateLimiter()

    async def dispatch(self, request: Request, call_next):
        if not settings.rate_limit_enabled:
            return await call_next(request)

        rule = get_rule(request.url.path)
        if rule is None or request.method == "OPTIONS":
            return await call_next(request)

        key = _request_key(request)
        allowed, retry_after = self.limiter.check(key, *rule)
        if not allowed:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please slow down."},
                headers={"Retry-After": str(retry_after)},
            )
        return await call_next(request)
