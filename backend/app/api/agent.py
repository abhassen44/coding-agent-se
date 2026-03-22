"""API routes for the AI Agent system."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.schemas.agent import (
    AgentRequest,
    AgentResponse,
    AgentApplyRequest,
    AgentApplyResponse,
)
from app.services.agent_service import AgentService

router = APIRouter(prefix="/agent", tags=["AI Agent"])


@router.post("/act", response_model=AgentResponse)
async def agent_act(
    request: AgentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Plan AI actions for a workspace.
    The AI reads workspace files, understands the request, and proposes
    structured actions (file edits, creates, deletes, commands).
    User reviews before applying.
    """
    agent = AgentService(db)
    response = await agent.plan_actions(
        workspace_id=request.workspace_id,
        user_id=current_user.id,
        prompt=request.prompt,
        file_paths=request.file_paths,
        provider=request.provider or "auto",
    )
    return response


@router.post("/apply", response_model=AgentApplyResponse)
async def agent_apply(
    request: AgentApplyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Apply user-approved AI actions to a workspace.
    Only actions the user explicitly accepted should be sent here.
    """
    agent = AgentService(db)
    results = await agent.apply_actions(
        workspace_id=request.workspace_id,
        user_id=current_user.id,
        actions=request.actions,
    )
    return AgentApplyResponse(
        results=results,
        all_succeeded=all(r.success for r in results),
    )
