"""Pydantic schemas for Phase 4 code execution."""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class ExecuteRequest(BaseModel):
    """Request to execute code in the sandbox."""
    code: str = Field(..., description="Source code to execute")
    language: str = Field(..., description="Programming language (python, javascript, cpp, java)")
    stdin: Optional[str] = Field(None, description="Optional standard input")
    timeout: Optional[int] = Field(10, ge=1, le=30, description="Timeout in seconds (1-30)")


class ExecuteResponse(BaseModel):
    """Response from a code execution."""
    id: int
    language: str
    status: str  # pending | running | success | error | timeout
    stdout: Optional[str] = None
    stderr: Optional[str] = None
    exit_code: Optional[int] = None
    execution_time_ms: Optional[int] = None
    memory_used_kb: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ExecutionHistoryResponse(BaseModel):
    """List of past executions."""
    executions: List[ExecuteResponse]
    total: int


class DiagnosticRequest(BaseModel):
    """Request for AI error diagnostics."""
    pass  # No body needed, execution_id comes from path


class DiagnosticResponse(BaseModel):
    """AI-generated error diagnostic."""
    execution_id: int
    diagnostic: str
