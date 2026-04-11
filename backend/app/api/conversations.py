"""REST API endpoints for conversation management."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.services.conversation_service import ConversationService
from app.services.redis_memory import get_redis_memory

router = APIRouter(prefix="/conversations", tags=["Conversations"])


# ── Schemas ──────────────────────────────────────────────────────

class ConversationOut(BaseModel):
    id: int
    title: Optional[str] = None
    workspace_id: Optional[int] = None
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


class MessageOut(BaseModel):
    id: int
    role: str
    content: str
    metadata_json: Optional[dict] = None
    created_at: str

    class Config:
        from_attributes = True


class ConversationListResponse(BaseModel):
    conversations: list[ConversationOut]


class MessageListResponse(BaseModel):
    messages: list[MessageOut]
    conversation_id: int


# ── Endpoints ────────────────────────────────────────────────────

@router.get("", response_model=ConversationListResponse)
async def list_conversations(
    workspace_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List conversations for the current user. Pass workspace_id to filter."""
    conv_service = ConversationService(db)
    convs = await conv_service.list_conversations(
        user_id=current_user.id,
        workspace_id=workspace_id,
    )
    return ConversationListResponse(
        conversations=[
            ConversationOut(
                id=c.id,
                title=c.title,
                workspace_id=c.workspace_id,
                created_at=c.created_at.isoformat() if c.created_at else "",
                updated_at=c.updated_at.isoformat() if c.updated_at else "",
            )
            for c in convs
        ]
    )


@router.get("/{conversation_id}/messages", response_model=MessageListResponse)
async def get_conversation_messages(
    conversation_id: int,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get messages for a conversation."""
    conv_service = ConversationService(db)
    conv = await conv_service.get(conversation_id)
    if not conv or conv.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Conversation not found")

    messages = await conv_service.get_history(conversation_id, limit=limit)
    return MessageListResponse(
        conversation_id=conversation_id,
        messages=[
            MessageOut(
                id=m.id,
                role=m.role,
                content=m.content,
                metadata_json=m.metadata_json,
                created_at=m.created_at.isoformat() if m.created_at else "",
            )
            for m in messages
        ],
    )


class RenameRequest(BaseModel):
    title: str


@router.patch("/{conversation_id}")
async def rename_conversation(
    conversation_id: int,
    body: RenameRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Rename a conversation."""
    conv_service = ConversationService(db)
    conv = await conv_service.get(conversation_id)
    if not conv or conv.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await conv_service.update_title(conversation_id, body.title)
    return {"status": "renamed", "conversation_id": conversation_id, "title": body.title}


@router.delete("/{conversation_id}")
async def delete_conversation(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a conversation and all its messages. Also clears Redis cache."""
    conv_service = ConversationService(db)
    deleted = await conv_service.delete_conversation(conversation_id, current_user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Clear Redis buffer
    redis_mem = get_redis_memory()
    await redis_mem.clear(conversation_id)

    return {"status": "deleted", "conversation_id": conversation_id}
