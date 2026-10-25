import uuid
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from typing import AsyncGenerator, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.chat import (
    ChatRequest,
    ChatResponse,
    CodeGenerateRequest,
    CodeExplainRequest,
    CodeDebugRequest,
    CodeResponse,
)
from app.services.gemini_service import get_gemini_service
from app.services.ollama_service import get_ollama_service, is_ollama_provider
from app.services.rag_service import RAGService
from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.file import Repository

router = APIRouter(prefix="/chat", tags=["Chat & Code Intelligence"])


async def _assert_repository_owner(
    db: AsyncSession, repository_id: Optional[int], user_id: int
) -> None:
    """Reject repository IDs the caller does not own."""
    if not repository_id:
        return
    result = await db.execute(
        select(Repository.id).where(
            Repository.id == repository_id,
            Repository.owner_id == user_id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Repository not found")


async def get_rag_context(
    db: AsyncSession,
    message: str,
    repository_id: Optional[int] = None,
    owner_id: Optional[int] = None,
) -> Optional[str]:
    """Fetch RAG context for a message."""
    if not repository_id:
        return None

    rag_service = RAGService(db)
    context_response = await rag_service.get_context_for_chat(
        query=message,
        repository_id=repository_id,
        max_chunks=5,
        owner_id=owner_id,
    )
    return context_response.context if context_response.context else None


def get_ai_service(provider: str = "gemini"):
    """Get the appropriate AI service based on provider."""
    if is_ollama_provider(provider):
        return get_ollama_service(provider)
    return get_gemini_service()


@router.post("/message", response_model=ChatResponse)
async def send_message(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a message and get AI response with optional RAG context."""
    from app.services.conversation_service import ConversationService
    from app.services.context_manager import ContextManager
    from app.services.redis_memory import get_redis_memory

    ai_service = get_ai_service(request.provider or "gemini")
    conv_service = ConversationService(db)
    redis_mem = get_redis_memory()
    ctx_mgr = ContextManager(redis_mem, conv_service)

    # Reject foreign repositories before creating a conversation.
    await _assert_repository_owner(db, request.repository_id, current_user.id)

    # ── Memory: load owned conversation or create one ──
    conversation = None
    if request.conversation_id:
        conversation = await conv_service.get_for_user(
            request.conversation_id, current_user.id
        )
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
    if not conversation:
        title = request.message[:40] + ("..." if len(request.message) > 40 else "")
        conversation = await conv_service.create(
            user_id=current_user.id,
            title=title,
        )

    # ── Memory: load history from DB (not from frontend) ──
    history_msgs = await ctx_mgr.get_context_messages(conversation.id)
    history = ctx_mgr.to_chat_history_dicts(history_msgs)
    if not history and request.history:
        history = [
            {"role": msg.role, "content": msg.content}
            for msg in request.history
            if msg.role in ("user", "assistant")
        ]

    # Get RAG context only from a repository the caller owns
    context = request.context
    context_used = False
    if request.repository_id and not context:
        context = await get_rag_context(
            db, request.message, request.repository_id, current_user.id
        )

    if context:
        context_used = True

    # Generate response with DB-backed history
    response = await ai_service.generate_response(request.message, history, context)

    session_id = request.session_id or str(uuid.uuid4())

    # ── Memory: persist messages ──
    try:
        await conv_service.add_message(conversation.id, "user", request.message)
        await redis_mem.push_message(conversation.id, "user", request.message)

        await conv_service.add_message(
            conversation.id, "assistant", response,
            metadata={"provider": request.provider, "context_used": context_used}
        )
        await redis_mem.push_message(conversation.id, "assistant", response)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Failed to persist chat memory: {e}")

    return ChatResponse(
        message=response,
        session_id=session_id,
        conversation_id=conversation.id,
        context_used=context_used,
    )


@router.post("/stream")
async def stream_message(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Stream AI response for a message with optional RAG context."""
    from app.services.conversation_service import ConversationService

    if request.conversation_id:
        conversation = await ConversationService(db).get_for_user(
            request.conversation_id, current_user.id
        )
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")

    await _assert_repository_owner(db, request.repository_id, current_user.id)
    ai_service = get_ai_service(request.provider or "gemini")

    # Convert history to dict format
    history = None
    if request.history:
        history = [{"role": msg.role, "content": msg.content} for msg in request.history]

    # Get RAG context if repository is specified
    context = request.context
    if request.repository_id and not context:
        context = await get_rag_context(
            db, request.message, request.repository_id, current_user.id
        )

    async def generate() -> AsyncGenerator[str, None]:
        async for chunk in ai_service.stream_response(request.message, history, context):
            yield f"data: {chunk}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.post("/generate", response_model=CodeResponse)
async def generate_code(
    request: CodeGenerateRequest,
    current_user: User = Depends(get_current_user),
):
    """Generate code for a specific task."""
    gemini = get_gemini_service()

    result = await gemini.generate_code(
        task=request.task,
        language=request.language,
        context=request.context,
    )

    return CodeResponse(result=result, language=request.language)


@router.post("/explain", response_model=CodeResponse)
async def explain_code(
    request: CodeExplainRequest,
    current_user: User = Depends(get_current_user),
):
    """Explain a piece of code."""
    gemini = get_gemini_service()

    result = await gemini.explain_code(
        code=request.code,
        language=request.language,
    )

    return CodeResponse(result=result, language=request.language)


@router.post("/debug", response_model=CodeResponse)
async def debug_code(
    request: CodeDebugRequest,
    current_user: User = Depends(get_current_user),
):
    """Debug code and suggest fixes."""
    gemini = get_gemini_service()

    result = await gemini.debug_code(
        code=request.code,
        error=request.error,
        language=request.language,
    )

    return CodeResponse(result=result, language=request.language)
