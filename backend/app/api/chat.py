import uuid
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
from typing import AsyncGenerator, Optional
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

router = APIRouter(prefix="/chat", tags=["Chat & Code Intelligence"])


async def get_rag_context(
    db: AsyncSession,
    message: str,
    repository_id: Optional[int] = None
) -> Optional[str]:
    """Fetch RAG context for a message."""
    if not repository_id:
        return None
    
    rag_service = RAGService(db)
    context_response = await rag_service.get_context_for_chat(
        query=message,
        repository_id=repository_id,
        max_chunks=5
    )
    return context_response.context if context_response.context else None


def get_ai_service(provider: str = "qwen-cloud"):
    """Get the appropriate AI service based on provider."""
    if is_ollama_provider(provider):
        return get_ollama_service(provider)
    return get_gemini_service()


@router.post("/message", response_model=ChatResponse)
async def send_message(
    request: ChatRequest,
    raw_request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Send a message and get AI response with optional RAG context."""
    from app.services.conversation_service import ConversationService
    from app.services.context_manager import ContextManager
    from app.services.redis_memory import get_redis_memory
    from app.core.security import decode_token

    # ── Resolve user from JWT (best-effort, no hard auth gate) ──
    user_id = 1  # fallback for unauthenticated usage
    try:
        auth_header = raw_request.headers.get("authorization", "") if raw_request else ""
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
            payload = decode_token(token)
            if payload and payload.get("sub"):
                user_id = int(payload["sub"])
    except Exception:
        pass

    ai_service = get_ai_service(request.provider or "qwen-cloud")
    conv_service = ConversationService(db)
    redis_mem = get_redis_memory()
    ctx_mgr = ContextManager(redis_mem, conv_service)

    # ── Memory: get or create conversation ──
    conversation = None
    if request.conversation_id:
        conversation = await conv_service.get(request.conversation_id)
    if not conversation:
        title = request.message[:40] + ("..." if len(request.message) > 40 else "")
        conversation = await conv_service.create(
            user_id=user_id,
            title=title,
        )

    # ── Memory: load history from DB (not from frontend) ──
    history_msgs = await ctx_mgr.get_context_messages(conversation.id)
    history = ctx_mgr.to_chat_history_dicts(history_msgs)

    # Get RAG context if repository is specified
    context = request.context
    context_used = False
    if request.repository_id and not context:
        context = await get_rag_context(db, request.message, request.repository_id)

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
async def stream_message(request: ChatRequest, db: AsyncSession = Depends(get_db)):
    """Stream AI response for a message with optional RAG context."""
    ai_service = get_ai_service(request.provider or "qwen-cloud")
    
    # Convert history to dict format
    history = None
    if request.history:
        history = [{"role": msg.role, "content": msg.content} for msg in request.history]
    
    # Get RAG context if repository is specified
    context = request.context
    if request.repository_id and not context:
        context = await get_rag_context(db, request.message, request.repository_id)
    
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
async def generate_code(request: CodeGenerateRequest):
    """Generate code for a specific task."""
    gemini = get_gemini_service()
    
    result = await gemini.generate_code(
        task=request.task,
        language=request.language,
        context=request.context,
    )
    
    return CodeResponse(result=result, language=request.language)


@router.post("/explain", response_model=CodeResponse)
async def explain_code(request: CodeExplainRequest):
    """Explain a piece of code."""
    gemini = get_gemini_service()
    
    result = await gemini.explain_code(
        code=request.code,
        language=request.language,
    )
    
    return CodeResponse(result=result, language=request.language)


@router.post("/debug", response_model=CodeResponse)
async def debug_code(request: CodeDebugRequest):
    """Debug code and suggest fixes."""
    gemini = get_gemini_service()
    
    result = await gemini.debug_code(
        code=request.code,
        error=request.error,
        language=request.language,
    )
    
    return CodeResponse(result=result, language=request.language)
