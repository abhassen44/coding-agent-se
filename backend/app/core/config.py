from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # App
    app_name: str = "Intelligent Coding Agent"
    debug: bool = False
    environment: str = "development"  # development | staging | production
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    rate_limit_enabled: bool = True
    
    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@127.0.0.1:5432/ica"
    
    # JWT
    secret_key: str = "your-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 10080  # 7 days
    refresh_token_expire_days: int = 30
    preview_token_expire_minutes: int = 10
    
    # Gemini AI
    gemini_api_key: str = ""
    gemini_chat_model: str = "gemini-3-flash-preview"
    
    # HuggingFace
    hf_api_token: str = ""
    
    github_token: str = ""
    # Vector DB
    qdrant_host: str = "127.0.0.1"
    qdrant_port: int = 6333
    qdrant_collection: str = "ica_code_chunks"
    
    # File Storage
    file_storage_path: str = "./storage/files"
    
    # Redis
    redis_url: str = "redis://127.0.0.1:6380"

    # Ollama (local or remote daemon)
    ollama_base_url: str = "http://127.0.0.1:11434"
    
    # Execution Engine
    execution_timeout: int = 10
    execution_memory_limit: str = "256m"
    execution_cpu_quota: int = 50000
    
    # Workspace
    workspace_base_image: str = "node:20-bookworm"
    workspace_memory_limit: str = "512m"
    workspace_cpu_quota: int = 100000
    max_workspaces_per_user: int = 1
    max_workspaces_global: int = 2
    preview_bind_host: str = "127.0.0.1"   # host interface for published preview ports
    preview_connect_host: str = "127.0.0.1"  # host the backend uses to reach those ports

    # Admin bootstrap — set ADMIN_EMAIL env var and ALLOW_ADMIN_BOOTSTRAP=true
    admin_email: str = ""
    allow_admin_bootstrap: bool = False

    @property
    def cors_origin_list(self) -> list[str]:
        """Parse the comma-separated CORS allowlist."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
