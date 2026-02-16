"""File and Repository models for Phase 3 RAG system."""
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Repository(Base):
    """Repository model for imported codebases."""
    __tablename__ = "repositories"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    local_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    indexed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    files: Mapped[List["File"]] = relationship("File", back_populates="repository", cascade="all, delete-orphan")


class File(Base):
    """File model for uploaded or indexed files."""
    __tablename__ = "files"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    path: Mapped[str] = mapped_column(String(512), nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    content_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    mime_type: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    language: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    repository_id: Mapped[Optional[int]] = mapped_column(ForeignKey("repositories.id"), nullable=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(512), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    # Relationships
    repository: Mapped[Optional["Repository"]] = relationship("Repository", back_populates="files")
    chunks: Mapped[List["FileChunk"]] = relationship("FileChunk", back_populates="file", cascade="all, delete-orphan")


class FileChunk(Base):
    """Chunk model for RAG indexing."""
    __tablename__ = "file_chunks"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    file_id: Mapped[int] = mapped_column(ForeignKey("files.id"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    start_line: Mapped[int] = mapped_column(Integer, nullable=False)
    end_line: Mapped[int] = mapped_column(Integer, nullable=False)
    embedding_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)  # Qdrant point ID
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    # Relationships
    file: Mapped["File"] = relationship("File", back_populates="chunks")
