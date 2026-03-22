"""Workspace model for Phase 4A sandboxed development environments."""
from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, Integer, Text, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Workspace(Base):
    """Model for persistent Docker workspace containers."""
    __tablename__ = "workspaces"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    repo_id: Mapped[Optional[int]] = mapped_column(ForeignKey("repositories.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    container_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    volume_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), default="creating", nullable=False
    )  # creating | running | stopped | error | destroyed
    base_image: Mapped[str] = mapped_column(String(100), default="node:20-bookworm")
    work_dir: Mapped[str] = mapped_column(String(255), default="/workspace")
    repo_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    last_accessed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    def __repr__(self) -> str:
        return f"<Workspace {self.id} [{self.name}] {self.status}>"
