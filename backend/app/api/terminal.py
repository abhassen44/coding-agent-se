"""WebSocket terminal endpoint — streams a shell inside a workspace container."""
import asyncio
import subprocess
import threading
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy import select

from app.core.database import async_session_maker
from app.core.security import decode_token
from app.models.workspace import Workspace
from app.services.auth_service import AuthService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/terminal", tags=["Terminal"])

# ── Constants ──────────────────────────────────────────────────────────────────
READ_CHUNK = 4096
STDOUT_SEND_TIMEOUT = 5       # seconds
WS_RECEIVE_TIMEOUT = 1.0      # seconds
PROCESS_KILL_TIMEOUT = 2      # seconds
MAX_INPUT_BUFFER = 4096       # bytes — prevent unbounded growth


# ── Auth helper ───────────────────────────────────────────────────────────────
async def _authenticate_ws(token: str) -> int | None:
    """Validate JWT and return user_id, or None."""
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        return None
    user_id = payload.get("sub")
    if user_id is None:
        return None
    try:
        async with async_session_maker() as db:
            auth_service = AuthService(db)
            user = await auth_service.get_user_by_id(int(user_id))
            if user and user.is_active:
                return user.id
    except Exception:
        logger.exception("DB error during WS authentication")
    return None


# ── Workspace lookup ──────────────────────────────────────────────────────────
async def _get_workspace(workspace_id: int, user_id: int) -> Workspace | None:
    """Return workspace if it belongs to user, else None."""
    async with async_session_maker() as db:
        result = await db.execute(
            select(Workspace).where(
                Workspace.id == workspace_id,
                Workspace.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()


# ── Stdout reader (background thread) ────────────────────────────────────────
def _make_stdout_reader(
    process: subprocess.Popen,
    websocket: WebSocket,
    loop: asyncio.AbstractEventLoop,
    closed: threading.Event,
):
    """Return a thread-target that pipes process stdout to the WebSocket."""

    def _read():
        try:
            while not closed.is_set():
                data = process.stdout.read(READ_CHUNK)
                if not data:
                    break
                text = data.decode("utf-8", errors="replace")
                # Normalise to \r\n for xterm.js
                text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\n", "\r\n")
                future = asyncio.run_coroutine_threadsafe(
                    websocket.send_text(text), loop
                )
                try:
                    future.result(timeout=STDOUT_SEND_TIMEOUT)
                except Exception as exc:
                    logger.warning(f"stdout send failed: {exc}")
                    break
        except Exception:
            if not closed.is_set():
                logger.exception("Unexpected error in stdout reader thread")
        finally:
            closed.set()

    return _read


# ── Process input handler ─────────────────────────────────────────────────────
async def _handle_input(
    raw: bytes,
    process: subprocess.Popen,
    websocket: WebSocket,
    input_buffer: bytearray,
    closed: threading.Event,
) -> bool:
    """
    Process a chunk of raw bytes from the WebSocket client.
    Returns False if the session should end.
    """
    text = raw.decode("utf-8", errors="replace")

    for ch in text:
        if closed.is_set() or process.stdin is None or process.poll() is not None:
            return False

        if ch in ("\r", "\n"):
            await websocket.send_text("\r\n")
            line = input_buffer.decode("utf-8", errors="replace") + "\n"
            process.stdin.write(line.encode("utf-8"))
            process.stdin.flush()
            input_buffer.clear()

        elif ch in ("\x7f", "\x08"):  # Backspace / DEL
            if input_buffer:
                input_buffer.pop()
                await websocket.send_text("\b \b")

        elif ch == "\x03":  # Ctrl-C
            await websocket.send_text("^C\r\n")
            input_buffer.clear()
            process.stdin.write(b"\x03\n")
            process.stdin.flush()

        elif ch == "\x04":  # Ctrl-D  (EOF)
            return False

        elif ch == "\t":  # Tab — forward to bash for completion
            process.stdin.write(b"\t")
            process.stdin.flush()

        elif ch.isprintable():
            # Guard against runaway pastes / buffer-overflow attempts
            if len(input_buffer) < MAX_INPUT_BUFFER:
                await websocket.send_text(ch)
                input_buffer.extend(ch.encode("utf-8"))
            # silently drop if buffer is full

    return True


# ── Main endpoint ─────────────────────────────────────────────────────────────
@router.websocket("/{workspace_id}")
async def terminal_ws(
    websocket: WebSocket,
    workspace_id: int,
    token: str = Query(...),
):
    """
    WebSocket terminal endpoint using `docker exec` subprocess.
    Compatible with Docker Desktop (Windows/macOS) and Linux.
    """
    # ── Auth ──
    user_id = await _authenticate_ws(token)
    if user_id is None:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    # ── Workspace ownership & readiness ──
    workspace = await _get_workspace(workspace_id, user_id)
    if not workspace:
        await websocket.close(code=4004, reason="Workspace not found")
        return
    if workspace.status != "running":
        await websocket.close(code=4003, reason=f"Workspace is {workspace.status}, not running")
        return
    if not workspace.container_id:
        await websocket.close(code=4003, reason="No container for this workspace")
        return

    await websocket.accept()

    # ── Spawn bash inside container ──
    try:
        process = subprocess.Popen(
            [
                "docker", "exec", "-i",
                "-e", "TERM=xterm-256color",
                "-w", "/workspace",
                workspace.container_id,
                "/bin/bash",
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            bufsize=0,
        )
    except FileNotFoundError:
        await websocket.send_text("\r\n\x1b[31m❌ Docker CLI not found in PATH.\x1b[0m\r\n")
        await websocket.close()
        return
    except Exception as exc:
        logger.error(f"Failed to start docker exec: {type(exc).__name__}: {exc}")
        await websocket.send_text(
            f"\r\n\x1b[31m❌ Failed to start shell: {type(exc).__name__}: {exc}\x1b[0m\r\n"
        )
        await websocket.close()
        return

    # Send PS1 init command to set the prompt (bash special sequences like \u \h \w
    # must be interpreted *by bash itself*, not passed via env var)
    init_cmds = (
        r"export PS1='\[\033[01;32m\]\u@\h\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$ '"
        "\nclear\n"
    )
    process.stdin.write(init_cmds.encode("utf-8"))
    process.stdin.flush()

    loop = asyncio.get_event_loop()
    closed = threading.Event()
    input_buffer = bytearray()

    # ── Start stdout reader thread ──
    read_thread = threading.Thread(
        target=_make_stdout_reader(process, websocket, loop, closed),
        daemon=True,
    )
    read_thread.start()

    # ── WebSocket → stdin pump ──
    try:
        while not closed.is_set():
            try:
                raw = await asyncio.wait_for(
                    websocket.receive_bytes(), timeout=WS_RECEIVE_TIMEOUT
                )
            except asyncio.TimeoutError:
                if process.poll() is not None:
                    break
                continue
            except WebSocketDisconnect:
                break

            if not await _handle_input(raw, process, websocket, input_buffer, closed):
                break

    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception(f"Unexpected error in terminal write loop (workspace {workspace_id})")
    finally:
        closed.set()
        if process.poll() is None:
            try:
                process.kill()
                process.wait(timeout=PROCESS_KILL_TIMEOUT)
            except Exception:
                logger.warning(f"Could not kill docker exec process for workspace {workspace_id}")
        try:
            await websocket.close()
        except Exception:
            pass
        read_thread.join(timeout=PROCESS_KILL_TIMEOUT)
        logger.info(f"Terminal session closed for workspace {workspace_id}")