"""
Context Manager — Token-aware history injection for LLM calls.

Loads history from Redis (hot) → Postgres (cold), truncates to budget,
summarizes tool outputs, and converts to LangChain message format.
"""
import logging
from typing import Optional

from langchain_core.messages import HumanMessage, AIMessage

from app.services.redis_memory import RedisMemory
from app.services.conversation_service import ConversationService

logger = logging.getLogger(__name__)


class ContextManager:
    """Prepares conversation history for injection into LLM context."""

    MAX_HISTORY_TOKENS = 6000    # Token budget for injected history
    MAX_TOOL_SUMMARY_CHARS = 200  # Max chars per tool output summary

    def __init__(
        self,
        redis_memory: RedisMemory,
        conv_service: ConversationService,
    ):
        self.redis = redis_memory
        self.conv = conv_service

    # ── Main entry point ─────────────────────────────────────────

    async def get_context_messages(self, conversation_id: int) -> list[dict]:
        """
        Load history for LLM injection.
        Strategy: Redis first (fast), Postgres fallback (cold start).
        Returns list of {"role": str, "content": str, "metadata": dict}.
        """
        # Hot path — Redis
        messages = await self.redis.get_messages(conversation_id)
        if messages:
            logger.debug(f"Redis hit: {len(messages)} messages for conv {conversation_id}")
            return self._truncate_to_budget(messages)

        # Cold start — Postgres
        db_msgs = await self.conv.get_history(conversation_id, limit=30)
        if not db_msgs:
            return []

        messages = [
            {
                "role": m.role,
                "content": m.content,
                "metadata": m.metadata_json or {},
            }
            for m in db_msgs
        ]
        logger.debug(f"Postgres loaded: {len(messages)} messages for conv {conversation_id}")

        # Warm the Redis cache for next call
        for msg in messages:
            await self.redis.push_message(
                conversation_id, msg["role"], msg["content"], msg.get("metadata")
            )

        return self._truncate_to_budget(messages)

    # ── LangChain conversion ─────────────────────────────────────

    def to_langchain_messages(self, messages: list[dict]) -> list:
        """Convert DB/Redis messages to LangChain message objects for the agent."""
        lc_messages = []
        for msg in messages:
            role = msg["role"]
            content = msg["content"]

            if role == "user":
                lc_messages.append(HumanMessage(content=content))
            elif role in ("assistant", "agent"):
                lc_messages.append(AIMessage(content=content))
            elif role == "tool_summary":
                # Inject as a compact AI message so the model knows what it did
                lc_messages.append(AIMessage(content=f"[Previous action: {content}]"))

        return lc_messages

    def to_chat_history_dicts(self, messages: list[dict]) -> list[dict]:
        """Convert to simple {role, content} dicts for the RAG chat service."""
        result = []
        for msg in messages:
            role = msg["role"]
            if role == "tool_summary":
                continue  # Skip tool summaries for RAG chat
            # Gemini expects "user" or "model"
            result.append({
                "role": "user" if role == "user" else "assistant",
                "content": msg["content"],
            })
        return result

    # ── Truncation ───────────────────────────────────────────────

    def _truncate_to_budget(self, messages: list[dict]) -> list[dict]:
        """
        Keep recent messages within the token budget.
        Drops oldest messages first, always keeping the most recent ones.
        """
        total_tokens = 0
        kept: list[dict] = []

        # Walk backwards (newest first), keep until budget exhausted
        for msg in reversed(messages):
            tokens = self._estimate_tokens(msg["content"])
            if total_tokens + tokens > self.MAX_HISTORY_TOKENS:
                break
            kept.insert(0, msg)
            total_tokens += tokens

        if len(kept) < len(messages):
            logger.debug(
                f"Truncated history: {len(messages)} → {len(kept)} messages "
                f"({total_tokens} tokens)"
            )

        return kept

    # ── Tool output summarization ────────────────────────────────

    @staticmethod
    def summarize_tool_output(
        tool_name: str,
        args: dict,
        output: str,
    ) -> str:
        """
        Condense a tool result for storage as a tool_summary message.
        Full output goes in metadata_json for debugging.
        """
        # Extract the most relevant arg for the summary
        path = args.get("path") or args.get("command") or args.get("pattern") or ""
        if isinstance(path, str) and len(path) > 60:
            path = path[:57] + "..."

        # Truncate output
        max_chars = ContextManager.MAX_TOOL_SUMMARY_CHARS
        short_output = output[:max_chars] + "..." if len(output) > max_chars else output
        # Remove newlines for compact storage
        short_output = short_output.replace("\n", " ").strip()

        return f"{tool_name}({path}) → {short_output}"

    # ── Helpers ──────────────────────────────────────────────────

    @staticmethod
    def _estimate_tokens(text: str) -> int:
        """Rough token estimate: ~4 chars per token."""
        return len(text) // 4
