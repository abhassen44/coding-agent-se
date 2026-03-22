"""Pydantic schemas for Phase 4A workspace API."""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class WorkspaceCreate(BaseModel):
    """Request to create a workspace."""
    repo_id: Optional[int] = Field(None, description="Repository ID from DB (uses stored repo URL)")
    repo_url: Optional[str] = Field(None, description="Direct GitHub repo URL to clone")
    name: Optional[str] = Field(None, description="Workspace name (auto-generated if omitted)")


class WorkspaceResponse(BaseModel):
    """Workspace details."""
    id: int
    name: str
    status: str
    repo_id: Optional[int] = None
    repo_url: Optional[str] = None
    base_image: str
    work_dir: str
    created_at: datetime
    last_accessed_at: Optional[datetime] = None
    error_message: Optional[str] = None

    class Config:
        from_attributes = True


class WorkspaceListResponse(BaseModel):
    """List of workspaces."""
    workspaces: List[WorkspaceResponse]
    total: int


class FileNode(BaseModel):
    """A file or directory entry in the workspace."""
    name: str
    path: str
    type: str  # "file" or "dir"
    size: Optional[int] = None


class FileTreeResponse(BaseModel):
    """File listing response."""
    path: str
    entries: List[FileNode]


class FileContentResponse(BaseModel):
    """File content response."""
    path: str
    content: str
    language: Optional[str] = None


class FileWriteRequest(BaseModel):
    """Write/create file request."""
    path: str = Field(..., description="File path relative to workspace root")
    content: str = Field(..., description="File content")


class FileCreateRequest(BaseModel):
    """Create file or directory."""
    path: str = Field(..., description="Path relative to workspace root")
    is_directory: bool = Field(False, description="True to create a directory")
    content: Optional[str] = Field("", description="Initial content (for files)")


class FileDeleteRequest(BaseModel):
    """Delete file or directory."""
    path: str = Field(..., description="Path relative to workspace root")
