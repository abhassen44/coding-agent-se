"""Regression tests for streaming RAG chat persistence."""
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models.conversation import Conversation
from app.services.conversation_service import ConversationService


@pytest.mark.asyncio
async def test_stream_persists_messages_and_returns_headers(
    client, db, engine, test_user, auth_token, monkeypatch
):
    class FakeAI:
        async def stream_response(self, message, history, context):
            yield "hello "
            yield "world"

    monkeypatch.setattr("app.api.chat.get_ai_service", lambda provider: FakeAI())
    monkeypatch.setattr(
        "app.api.chat.async_session_maker",
        async_sessionmaker(engine, expire_on_commit=False),
    )

    async with client.stream(
        "POST",
        "/api/v1/chat/stream",
        headers={"Authorization": f"Bearer {auth_token}"},
        json={"message": "hi"},
    ) as response:
        body = "".join([chunk async for chunk in response.aiter_text()])
        conversation_id = int(response.headers["x-conversation-id"])
        session_id = response.headers["x-session-id"]

    assert "data: hello " in body
    assert "data: world" in body
    assert "data: [DONE]" in body
    assert session_id

    row = await db.execute(
        select(Conversation.user_id).where(Conversation.id == conversation_id)
    )
    assert row.scalar_one() == test_user.id

    messages = await ConversationService(db).get_history(conversation_id)
    assert [m.role for m in messages] == ["user", "assistant"]
    assert messages[0].content == "hi"
    assert messages[1].content == "hello world"


@pytest.mark.asyncio
async def test_stream_requires_auth(client):
    response = await client.post("/api/v1/chat/stream", json={"message": "hi"})
    assert response.status_code in (401, 403)
