from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class ChatMessage(BaseModel):
    """Schema for a chat message."""
    role: str  # "user" or "assistant"
    content: str
    timestamp: Optional[datetime] = None


class ChatRequest(BaseModel):
    """Schema for chat request."""
    message: str
    session_id: Optional[str] = None
    history: Optional[List[ChatMessage]] = None
    repository_id: Optional[int] = None  # For RAG context injection
    context: Optional[str] = None  # Pre-fetched context
    provider: Optional[str] = "gemini"  # "gemini" or "qwen"


class ChatResponse(BaseModel):
    """Schema for chat response."""
    message: str
    session_id: str
    context_used: bool = False


class CodeGenerateRequest(BaseModel):
    """Schema for code generation request."""
    task: str
    language: str
    context: Optional[str] = None


class CodeExplainRequest(BaseModel):
    """Schema for code explanation request."""
    code: str
    language: str


class CodeDebugRequest(BaseModel):
    """Schema for code debugging request."""
    code: str
    error: str
    language: str


class CodeResponse(BaseModel):
    """Schema for code-related responses."""
    result: str
    language: str
