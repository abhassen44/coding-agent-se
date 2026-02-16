from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import api_router
from app.core.config import get_settings

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    print(f"Starting {settings.app_name}...")
    yield
    # Shutdown
    print("Shutting down...")


app = FastAPI(
    title=settings.app_name,
    description="Intelligent Coding Agent - AI-powered coding assistant",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://10.1.1.33:3000",
        "http://10.1.1.33:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "app": settings.app_name}
