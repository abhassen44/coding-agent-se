import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api import api_router
from app.core.config import get_settings
from app.core.database import engine
from app.core.rate_limit import RateLimitMiddleware

settings = get_settings()
logger = logging.getLogger(__name__)

DEFAULT_SECRET = "your-secret-key-change-in-production"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    if settings.environment.lower() == "production" and settings.secret_key == DEFAULT_SECRET:
        raise RuntimeError(
            "SECRET_KEY must be changed before running in production."
        )
    if settings.admin_email and not settings.allow_admin_bootstrap:
        logger.info(
            "ADMIN_EMAIL is set but ALLOW_ADMIN_BOOTSTRAP is false; "
            "admin promotion is disabled."
        )
    logger.info("Starting %s...", settings.app_name)
    yield
    await engine.dispose()
    logger.info("Shutting down...")


app = FastAPI(
    title=settings.app_name,
    description="Intelligent Coding Agent - AI-powered coding assistant",
    version="0.1.0",
    lifespan=lifespan,
)

# Rate limiting runs inside CORS so 429 responses still carry CORS headers.
app.add_middleware(RateLimitMiddleware)

# CORS: explicit allowlist by default; permissive only in debug mode.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=".*" if settings.debug else None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(api_router, prefix="/api/v1")


async def _with_timeout(coro, default: str) -> str:
    try:
        await asyncio.wait_for(coro, timeout=3)
        return "ok"
    except Exception as exc:  # noqa: BLE001 - health checks report, never crash
        logger.warning("Health check failed: %s", exc)
        return default


async def _check_database() -> str:
    async def ping() -> None:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))

    return await _with_timeout(ping(), "unavailable")


async def _check_redis() -> str:
    import redis.asyncio as aioredis

    async def ping() -> None:
        client = aioredis.from_url(settings.redis_url)
        try:
            await client.ping()
        finally:
            await client.aclose()

    return await _with_timeout(ping(), "unavailable")


async def _check_qdrant() -> str:
    async def ping() -> None:
        from qdrant_client import QdrantClient

        client = QdrantClient(host=settings.qdrant_host, port=settings.qdrant_port)
        try:
            await asyncio.to_thread(client.get_collections)
        finally:
            client.close()

    return await _with_timeout(ping(), "unavailable")


async def _check_docker() -> str:
    async def ping() -> None:
        import docker

        client = docker.from_env()
        try:
            await asyncio.to_thread(client.ping)
        finally:
            client.close()

    return await _with_timeout(ping(), "unavailable")


@app.get("/health")
async def health_check():
    """Liveness plus per-dependency readiness."""
    dependencies = dict(
        zip(
            ("database", "redis", "qdrant", "docker"),
            await asyncio.gather(
                _check_database(),
                _check_redis(),
                _check_qdrant(),
                _check_docker(),
            ),
        )
    )
    healthy = all(status == "ok" for status in dependencies.values())
    return {
        "status": "healthy" if healthy else "degraded",
        "app": settings.app_name,
        "dependencies": dependencies,
    }
