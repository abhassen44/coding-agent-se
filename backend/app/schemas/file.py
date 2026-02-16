"""Pydantic schemas for file and repository operations."""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


# ========== File Schemas ==========

class FileBase(BaseModel):
    """Base file schema."""
    name: str
    path: str
    size: int
    mime_type: Optional[str] = None
    language: Optional[str] = None


class FileCreate(FileBase):
    """Schema for file creation (internal use)."""
    content_hash: Optional[str] = None
    storage_path: str
    repository_id: Optional[int] = None
    owner_id: int


class FileResponse(FileBase):
    """Schema for file response."""
    id: int
    content_hash: Optional[str] = None
    repository_id: Optional[int] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class FileUploadResponse(BaseModel):
    """Response after successful file upload."""
    file: FileResponse
    message: str = "File uploaded successfully"


class FileListResponse(BaseModel):
    """List of files response."""
    files: List[FileResponse]
    total: int


# ========== Repository Schemas ==========

class RepositoryBase(BaseModel):
    """Base repository schema."""
    name: str = Field(..., min_length=1, max_length=255)
    url: Optional[str] = None
    description: Optional[str] = None


class RepositoryCreate(RepositoryBase):
    """Schema for creating a repository."""
    pass


class RepositoryImport(BaseModel):
    """Schema for importing a GitHub repository."""
    url: str = Field(..., pattern=r"^https?://github\.com/.+/.+$")
    branch: str = "main"


class RepositoryResponse(RepositoryBase):
    """Schema for repository response."""
    id: int
    owner_id: int
    indexed_at: Optional[datetime] = None
    created_at: datetime
    file_count: int = 0

    model_config = {"from_attributes": True}


class RepositoryListResponse(BaseModel):
    """List of repositories response."""
    repositories: List[RepositoryResponse]
    total: int


# ========== Chunk Schemas ==========

class ChunkResponse(BaseModel):
    """Schema for file chunk response."""
    id: int
    file_id: int
    content: str
    start_line: int
    end_line: int
    file_path: Optional[str] = None
    file_name: Optional[str] = None
    relevance_score: float = 0.0

    model_config = {"from_attributes": True}


# ========== Search Schemas ==========

class SearchQuery(BaseModel):
    """Schema for semantic search query."""
    query: str = Field(..., min_length=1, max_length=1000)
    top_k: int = Field(default=5, ge=1, le=20)
    repository_id: Optional[int] = None


class SearchResult(BaseModel):
    """Schema for search result."""
    chunks: List[ChunkResponse]
    query: str
    total_results: int


# ========== Context Schemas ==========

class ContextRequest(BaseModel):
    """Request for RAG context."""
    query: str
    repository_id: Optional[int] = None
    max_chunks: int = Field(default=5, ge=1, le=10)


class ContextResponse(BaseModel):
    """RAG context response for chat."""
    context: str
    chunks: List[ChunkResponse]
    repository_name: Optional[str] = None
