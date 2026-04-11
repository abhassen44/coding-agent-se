"""
Tier 2 — Warm Memory: PostgreSQL conversation persistence.

CRUD for conversations and messages. One conversation per workspace (agent),
or multiple for RAG chat sessions.
"""
import logging
from typing import Optional

from sqlalchemy import select, desc, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.conversation import Conversation, ChatMessageRecord

logger = logging.getLogger(__name__)


class ConversationService:
    """Manage conversations and chat messages in PostgreSQL."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Conversation CRUD ────────────────────────────────────────

    async def create(
        self,
        user_id: int,
        workspace_id: Optional[int] = None,
        title: Optional[str] = None,
    ) -> Conversation:
        """Create a new conversation."""
        conv = Conversation(
            user_id=user_id,
            workspace_id=workspace_id,
            title=title,
        )
        self.db.add(conv)
        await self.db.commit()
        await self.db.refresh(conv)
        logger.info(f"Created conversation {conv.id} for user={user_id} ws={workspace_id}")
        return conv

    async def get(self, conversation_id: int) -> Optional[Conversation]:
        """Get a conversation by ID."""
        result = await self.db.execute(
            select(Conversation).where(Conversation.id == conversation_id)
        )
        return result.scalar_one_or_none()

    async def get_or_create_for_workspace(
        self, user_id: int, workspace_id: int
    ) -> Conversation:
        """One conversation per workspace — get existing or create new."""
        result = await self.db.execute(
            select(Conversation)
            .where(Conversation.user_id == user_id)
            .where(Conversation.workspace_id == workspace_id)
            .order_by(desc(Conversation.updated_at))
            .limit(1)
        )
        conv = result.scalar_one_or_none()
        if conv:
            return conv
        return await self.create(user_id, workspace_id, title="Workspace Chat")

    async def list_conversations(
        self,
        user_id: int,
        workspace_id: Optional[int] = None,
        limit: int = 20,
    ) -> list[Conversation]:
        """List conversations for a user, optionally filtered by workspace."""
        query = (
            select(Conversation)
            .where(Conversation.user_id == user_id)
            .order_by(desc(Conversation.updated_at))
            .limit(limit)
        )
        if workspace_id is not None:
            query = query.where(Conversation.workspace_id == workspace_id)
        else:
            # RAG chats only (no workspace)
            query = query.where(Conversation.workspace_id.is_(None))
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def delete_conversation(self, conversation_id: int, user_id: int) -> bool:
        """Delete a conversation and all its messages (CASCADE)."""
        conv = await self.get(conversation_id)
        if not conv or conv.user_id != user_id:
            return False
        await self.db.execute(
            delete(ChatMessageRecord).where(ChatMessageRecord.conversation_id == conversation_id)
        )
        await self.db.execute(
            delete(Conversation).where(Conversation.id == conversation_id)
        )
        await self.db.commit()
        logger.info(f"Deleted conversation {conversation_id}")
        return True

    async def update_title(self, conversation_id: int, title: str) -> None:
        """Update the conversation title."""
        conv = await self.get(conversation_id)
        if conv:
            conv.title = title
            await self.db.commit()

    # ── Message CRUD ─────────────────────────────────────────────

    async def add_message(
        self,
        conversation_id: int,
        role: str,
        content: str,
        metadata: Optional[dict] = None,
    ) -> ChatMessageRecord:
        """Add a message to a conversation."""
        msg = ChatMessageRecord(
            conversation_id=conversation_id,
            role=role,
            content=content,
            metadata_json=metadata,
        )
        self.db.add(msg)

        # Touch the conversation's updated_at
        conv = await self.get(conversation_id)
        if conv:
            conv.updated_at = func.now()

        await self.db.commit()
        await self.db.refresh(msg)
        return msg

    async def get_history(
        self, conversation_id: int, limit: int = 50
    ) -> list[ChatMessageRecord]:
        """Get the most recent N messages in chronological order."""
        # Subquery to get the last N message IDs
        subq = (
            select(ChatMessageRecord.id)
            .where(ChatMessageRecord.conversation_id == conversation_id)
            .order_by(desc(ChatMessageRecord.created_at))
            .limit(limit)
            .subquery()
        )
        result = await self.db.execute(
            select(ChatMessageRecord)
            .where(ChatMessageRecord.id.in_(select(subq)))
            .order_by(ChatMessageRecord.created_at)
        )
        return list(result.scalars().all())

    async def get_message_count(self, conversation_id: int) -> int:
        """Get the number of messages in a conversation."""
        result = await self.db.execute(
            select(func.count(ChatMessageRecord.id))
            .where(ChatMessageRecord.conversation_id == conversation_id)
        )
        return result.scalar() or 0
