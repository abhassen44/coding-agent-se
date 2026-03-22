"""API routes for Phase 4 sandboxed code execution."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.execution import (
    ExecuteRequest,
    ExecuteResponse,
    ExecutionHistoryResponse,
    DiagnosticResponse,
)
from app.services.execution_service import ExecutionService
from app.services.gemini_service import get_gemini_service
from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User

router = APIRouter(prefix="/execute", tags=["Code Execution"])


@router.post("/run", response_model=ExecuteResponse)
async def run_code(
    request: ExecuteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Execute code in a sandboxed Docker container."""
    service = ExecutionService(db)
    execution = await service.execute_code(
        user_id=current_user.id,
        code=request.code,
        language=request.language,
        stdin=request.stdin,
        timeout=request.timeout or 10,
    )
    return ExecuteResponse(
        id=execution.id,
        language=execution.language,
        status=execution.status,
        stdout=execution.stdout,
        stderr=execution.stderr,
        exit_code=execution.exit_code,
        execution_time_ms=execution.execution_time_ms,
        memory_used_kb=execution.memory_used_kb,
        created_at=execution.created_at,
    )


@router.get("/history", response_model=ExecutionHistoryResponse)
async def get_execution_history(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the current user's execution history."""
    service = ExecutionService(db)
    executions, total = await service.get_history(
        user_id=current_user.id, limit=limit, offset=offset
    )
    return ExecutionHistoryResponse(
        executions=[
            ExecuteResponse(
                id=e.id,
                language=e.language,
                status=e.status,
                stdout=e.stdout,
                stderr=e.stderr,
                exit_code=e.exit_code,
                execution_time_ms=e.execution_time_ms,
                memory_used_kb=e.memory_used_kb,
                created_at=e.created_at,
            )
            for e in executions
        ],
        total=total,
    )


@router.get("/{execution_id}", response_model=ExecuteResponse)
async def get_execution(
    execution_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific execution result."""
    service = ExecutionService(db)
    execution = await service.get_execution(execution_id, current_user.id)
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")
    return ExecuteResponse(
        id=execution.id,
        language=execution.language,
        status=execution.status,
        stdout=execution.stdout,
        stderr=execution.stderr,
        exit_code=execution.exit_code,
        execution_time_ms=execution.execution_time_ms,
        memory_used_kb=execution.memory_used_kb,
        created_at=execution.created_at,
    )


@router.post("/{execution_id}/diagnose", response_model=DiagnosticResponse)
async def diagnose_execution(
    execution_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Run AI error diagnostics on a failed execution."""
    service = ExecutionService(db)
    execution = await service.get_execution(execution_id, current_user.id)
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")

    if execution.status not in ("error", "timeout"):
        raise HTTPException(
            status_code=400,
            detail="Diagnostics are only available for failed executions",
        )

    # Use Gemini to diagnose the error
    gemini = get_gemini_service()
    diagnostic = await gemini.diagnose_execution_error(
        code=execution.code,
        language=execution.language,
        stderr=execution.stderr or "",
        exit_code=execution.exit_code,
    )

    # Save diagnostic to DB
    await service.save_diagnostic(execution_id, diagnostic)

    return DiagnosticResponse(
        execution_id=execution_id,
        diagnostic=diagnostic,
    )
