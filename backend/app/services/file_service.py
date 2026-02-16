"""File service for handling file uploads and storage."""
import os
import hashlib
import mimetypes
from pathlib import Path
from typing import Optional, List, BinaryIO
from datetime import datetime

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.file import File, Repository
from app.schemas.file import FileCreate, FileResponse
from app.core.config import get_settings

settings = get_settings()


# Language detection based on file extension
EXTENSION_TO_LANGUAGE = {
    ".py": "python",
    ".js": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".jsx": "javascript",
    ".java": "java",
    ".cpp": "cpp",
    ".c": "c",
    ".h": "c",
    ".hpp": "cpp",
    ".cs": "csharp",
    ".go": "go",
    ".rs": "rust",
    ".rb": "ruby",
    ".php": "php",
    ".swift": "swift",
    ".kt": "kotlin",
    ".scala": "scala",
    ".html": "html",
    ".css": "css",
    ".scss": "scss",
    ".json": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".md": "markdown",
    ".sql": "sql",
    ".sh": "bash",
    ".ps1": "powershell",
    # Documents
    ".pdf": "pdf",
    ".doc": "word",
    ".docx": "word",
    ".txt": "text",
    # Images
    ".png": "image",
    ".jpg": "image",
    ".jpeg": "image",
    ".gif": "image",
    ".webp": "image",
    ".svg": "svg",
    ".bmp": "image",
}


class FileService:
    """Service for file operations."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.storage_base = Path(settings.file_storage_path)
        self.storage_base.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def detect_language(filename: str) -> Optional[str]:
        """Detect programming language from file extension."""
        ext = Path(filename).suffix.lower()
        return EXTENSION_TO_LANGUAGE.get(ext)

    @staticmethod
    def compute_hash(content: bytes) -> str:
        """Compute SHA-256 hash of file content."""
        return hashlib.sha256(content).hexdigest()

    def _get_storage_path(self, owner_id: int, filename: str, content_hash: str) -> Path:
        """Generate storage path for file."""
        # Organize by owner_id and hash prefix for scalability
        hash_prefix = content_hash[:2]
        storage_dir = self.storage_base / str(owner_id) / hash_prefix
        storage_dir.mkdir(parents=True, exist_ok=True)
        return storage_dir / f"{content_hash}_{filename}"

    async def upload_file(
        self,
        file_content: bytes,
        filename: str,
        owner_id: int,
        repository_id: Optional[int] = None,
        original_path: Optional[str] = None
    ) -> File:
        """Upload and store a file."""
        # Compute file metadata
        content_hash = self.compute_hash(file_content)
        mime_type, _ = mimetypes.guess_type(filename)
        language = self.detect_language(filename)
        
        # Determine storage path
        storage_path = self._get_storage_path(owner_id, filename, content_hash)
        
        # Write file to storage
        with open(storage_path, "wb") as f:
            f.write(file_content)
        
        # Create database record
        file = File(
            name=filename,
            path=original_path or filename,
            size=len(file_content),
            content_hash=content_hash,
            mime_type=mime_type,
            language=language,
            repository_id=repository_id,
            owner_id=owner_id,
            storage_path=str(storage_path)
        )
        
        self.db.add(file)
        await self.db.commit()
        await self.db.refresh(file)
        
        return file

    async def get_file(self, file_id: int, owner_id: int) -> Optional[File]:
        """Get file by ID if owned by user."""
        result = await self.db.execute(
            select(File).where(File.id == file_id, File.owner_id == owner_id)
        )
        return result.scalar_one_or_none()

    async def get_file_content(self, file: File) -> Optional[bytes]:
        """Read file content from storage."""
        storage_path = Path(file.storage_path)
        if storage_path.exists():
            with open(storage_path, "rb") as f:
                return f.read()
        return None

    async def list_files(
        self,
        owner_id: int,
        repository_id: Optional[int] = None,
        offset: int = 0,
        limit: int = 50
    ) -> tuple[List[File], int]:
        """List files for a user, optionally filtered by repository."""
        query = select(File).where(File.owner_id == owner_id)
        count_query = select(func.count(File.id)).where(File.owner_id == owner_id)
        
        if repository_id:
            query = query.where(File.repository_id == repository_id)
            count_query = count_query.where(File.repository_id == repository_id)
        
        query = query.order_by(File.created_at.desc()).offset(offset).limit(limit)
        
        result = await self.db.execute(query)
        count_result = await self.db.execute(count_query)
        
        return list(result.scalars().all()), count_result.scalar_one()

    async def delete_file(self, file_id: int, owner_id: int) -> bool:
        """Delete a file."""
        file = await self.get_file(file_id, owner_id)
        if not file:
            return False
        
        # Delete from storage
        storage_path = Path(file.storage_path)
        if storage_path.exists():
            storage_path.unlink()
        
        # Delete from database
        await self.db.delete(file)
        await self.db.commit()
        
        return True
