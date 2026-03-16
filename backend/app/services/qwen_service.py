"""Service for interacting with Qwen 3.5 via Ollama."""
import httpx
from typing import AsyncGenerator, Optional


OLLAMA_BASE_URL = "http://localhost:11434"
OLLAMA_MODEL = "qwen3.5:9b"


class QwenService:
    """Service for interacting with Qwen 3.5 via Ollama API."""

    SYSTEM_PROMPT = """You are an expert coding assistant called ICA (Intelligent Coding Agent).
You help developers with:
- Writing clean, efficient, idiomatic code
- Explaining code concepts and logic
- Debugging errors and suggesting fixes
- Best practices and optimization

When generating code:
- Always use proper syntax highlighting with language identifiers
- Include helpful comments
- Follow language-specific conventions
- Handle edge cases appropriately

When explaining code:
- Break down complex logic step by step
- Highlight important patterns and concepts
- Point out potential issues or improvements

Support languages: Python, JavaScript, TypeScript, C++, Java, and more.

Format responses using Markdown with proper code blocks.

IMPORTANT: Do NOT wrap your response in <think> tags or show internal reasoning. Respond directly. Use /no_think mode."""

    def __init__(self):
        self.base_url = OLLAMA_BASE_URL
        self.model = OLLAMA_MODEL
        self._available = None
        print(f"Qwen service initialized (model: {self.model})")

    async def _check_available(self) -> bool:
        """Check if Ollama is running and model is available."""
        if self._available is not None:
            return self._available
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self.base_url}/api/tags")
                if resp.status_code == 200:
                    models = [m["name"] for m in resp.json().get("models", [])]
                    self._available = any(self.model in m for m in models)
                    return self._available
        except Exception as e:
            print(f"⚠️ Ollama connection check failed: {e}")
        self._available = False
        return False

    def _build_messages(
        self,
        message: str,
        chat_history: Optional[list[dict]] = None,
        context: Optional[str] = None,
    ) -> list[dict]:
        """Build Ollama chat messages array."""
        messages = [{"role": "system", "content": self.SYSTEM_PROMPT}]

        # Add chat history
        if chat_history:
            for msg in chat_history:
                role = "user" if msg["role"] == "user" else "assistant"
                messages.append({"role": role, "content": msg["content"]})

        # Build user message with optional RAG context
        if context:
            user_content = (
                f"The following code snippets from the repository are relevant to the user's question:\n\n"
                f"{context}\n\n"
                f"Use this context to provide accurate, repository-aware answers. "
                f"Reference specific file paths and line numbers when helpful.\n\n"
                f"User: {message}"
            )
        else:
            user_content = message

        messages.append({"role": "user", "content": user_content})
        return messages

    async def generate_response(
        self,
        message: str,
        chat_history: Optional[list[dict]] = None,
        context: Optional[str] = None,
    ) -> str:
        """Generate a response from Qwen via Ollama."""
        if not await self._check_available():
            return (
                "⚠️ **Ollama not available**\n\n"
                f"Make sure Ollama is running and the model `{self.model}` is pulled.\n\n"
                f"**To start Ollama:**\n"
                f"```bash\nollama serve\n```\n\n"
                f"**To pull the model:**\n"
                f"```bash\nollama pull {self.model}\n```"
            )

        messages = self._build_messages(message, chat_history, context)

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(
                    f"{self.base_url}/api/chat",
                    json={
                        "model": self.model,
                        "messages": messages,
                        "stream": False,
                        "options": {"temperature": 0.7},
                    },
                )
                if resp.status_code != 200:
                    return f"⚠️ **Ollama error:** HTTP {resp.status_code} - {resp.text[:200]}"
                resp.raise_for_status()
                data = resp.json()
                return data.get("message", {}).get("content", "No response received.")
        except httpx.ConnectError:
            return f"⚠️ **Cannot connect to Ollama** at {self.base_url}\n\nMake sure Ollama is running: `ollama serve`"
        except httpx.TimeoutException:
            return "⚠️ **Request timed out** — Qwen is taking too long to respond. The model may still be loading."
        except Exception as e:
            return f"⚠️ **Ollama error:** {type(e).__name__}: {str(e)}"

    async def stream_response(
        self,
        message: str,
        chat_history: Optional[list[dict]] = None,
        context: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        """Stream a response from Qwen via Ollama."""
        if not await self._check_available():
            yield (
                f"⚠️ **Ollama not available**\n\n"
                f"Run `ollama serve` and `ollama pull {self.model}`"
            )
            return

        messages = self._build_messages(message, chat_history, context)

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
                    "POST",
                    f"{self.base_url}/api/chat",
                    json={
                        "model": self.model,
                        "messages": messages,
                        "stream": True,
                        "options": {"temperature": 0.7},
                    },
                ) as resp:
                    if resp.status_code != 200:
                        yield f"⚠️ **Ollama error:** HTTP {resp.status_code}"
                        return
                    resp.raise_for_status()
                    import json
                    async for line in resp.aiter_lines():
                        if line.strip():
                            try:
                                data = json.loads(line)
                                content = data.get("message", {}).get("content", "")
                                if content:
                                    yield content
                            except json.JSONDecodeError:
                                continue
        except httpx.ConnectError:
            yield f"⚠️ **Cannot connect to Ollama** at {self.base_url}\n\nMake sure Ollama is running: `ollama serve`"
        except httpx.TimeoutException:
            yield "⚠️ **Request timed out** — Ollama is taking too long to respond."
        except Exception as e:
            yield f"⚠️ **Error:** {type(e).__name__}: {str(e)}"

    async def generate_code(
        self,
        task: str,
        language: str,
        context: Optional[str] = None,
    ) -> str:
        """Generate code for a specific task."""
        prompt = f"""Generate {language} code for the following task:

**Task:** {task}

{f'**Context:** {context}' if context else ''}

Provide:
1. Complete, working code
2. Brief explanation of the approach
3. Usage example if applicable"""

        return await self.generate_response(prompt)

    async def explain_code(self, code: str, language: str) -> str:
        """Explain a piece of code."""
        prompt = f"""Explain the following {language} code in detail:

```{language}
{code}
```

Provide:
1. Overall purpose and functionality
2. Line-by-line or section-by-section breakdown
3. Key concepts and patterns used
4. Potential improvements or issues"""

        return await self.generate_response(prompt)

    async def debug_code(
        self,
        code: str,
        error: str,
        language: str,
    ) -> str:
        """Debug code and suggest fixes."""
        prompt = f"""Debug the following {language} code that produces this error:

**Error:**
```
{error}
```

**Code:**
```{language}
{code}
```

Provide:
1. Root cause of the error
2. Fixed code with the issue resolved
3. Explanation of what was wrong
4. Tips to prevent similar issues"""

        return await self.generate_response(prompt)


# Singleton instance
_qwen_service: Optional[QwenService] = None


def get_qwen_service() -> QwenService:
    """Get or create the Qwen service instance."""
    global _qwen_service
    if _qwen_service is None:
        _qwen_service = QwenService()
    return _qwen_service
