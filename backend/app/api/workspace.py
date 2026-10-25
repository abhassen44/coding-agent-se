"""API routes for Phase 4A workspace management."""
import asyncio
import logging
from contextlib import suppress

import httpx
import websockets
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Request,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.preview_rewrite import rewrite_css, rewrite_html

from app.schemas.workspace import (
    WorkspaceCreate,
    WorkspaceResponse,
    WorkspaceListResponse,
    FileTreeResponse,
    FileNode,
    FileContentResponse,
    FileWriteRequest,
    FileCreateRequest,
    FileDeleteRequest,
    PreviewTokenRequest,
    PreviewTokenResponse,
)
from app.services.workspace_service import WorkspaceService
from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.database import get_db, async_session_maker
from app.core.security import create_preview_token, decode_preview_token
from app.models.user import User
from app.services.log_service import LogService, WORKSPACE_CREATED

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/workspace", tags=["Workspace"])
settings = get_settings()


@router.post("/create", response_model=WorkspaceResponse)
async def create_workspace(
    request: WorkspaceCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new workspace from a repo."""
    if not request.repo_id and not request.repo_url:
        raise HTTPException(status_code=400, detail="Either repo_id or repo_url is required")

    service = WorkspaceService(db)
    try:
        workspace = await service.create_workspace(
            user_id=current_user.id,
            repo_url=request.repo_url,
            repo_id=request.repo_id,
            name=request.name,
        )
        await LogService(db).log(
            action=WORKSPACE_CREATED,
            user_id=current_user.id,
            metadata={"workspace_id": workspace.id, "name": workspace.name},
        )
        return WorkspaceResponse.model_validate(workspace)
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("", response_model=WorkspaceListResponse)
async def list_workspaces(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
):
    """List user's workspaces."""
    service = WorkspaceService(db)
    workspaces, total = await service.list_workspaces(current_user.id, limit, offset)
    return WorkspaceListResponse(
        workspaces=[WorkspaceResponse.model_validate(w) for w in workspaces],
        total=total,
    )


@router.get("/{workspace_id}", response_model=WorkspaceResponse)
async def get_workspace(
    workspace_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get workspace details with live status."""
    service = WorkspaceService(db)
    workspace = await service.get_workspace(workspace_id, current_user.id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    response = WorkspaceResponse.model_validate(workspace)
    if workspace.status == "running":
        response.ports = await service.get_workspace_ports(workspace_id, current_user.id)
    return response


@router.post("/{workspace_id}/start", response_model=WorkspaceResponse)
async def start_workspace(
    workspace_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Start a stopped workspace."""
    service = WorkspaceService(db)
    try:
        workspace = await service.start_workspace(workspace_id, current_user.id)
        response = WorkspaceResponse.model_validate(workspace)
        response.ports = await service.get_workspace_ports(workspace_id, current_user.id)
        return response
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{workspace_id}/stop", response_model=WorkspaceResponse)
async def stop_workspace(
    workspace_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Stop a running workspace."""
    service = WorkspaceService(db)
    try:
        workspace = await service.stop_workspace(workspace_id, current_user.id)
        return WorkspaceResponse.model_validate(workspace)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{workspace_id}")
async def destroy_workspace(
    workspace_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Destroy a workspace entirely (container + volume)."""
    service = WorkspaceService(db)
    try:
        await service.destroy_workspace(workspace_id, current_user.id)
        return {"message": "Workspace destroyed"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── File System Endpoints ──────────────────────────────────────


@router.get("/{workspace_id}/files", response_model=FileTreeResponse)
async def list_workspace_files(
    workspace_id: int,
    path: str = Query(".", description="Relative path to list"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List files and directories in a workspace path."""
    service = WorkspaceService(db)
    try:
        entries = await service.list_files(workspace_id, current_user.id, path)
        return FileTreeResponse(
            path=path,
            entries=[FileNode(**e) for e in entries],
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{workspace_id}/files/read", response_model=FileContentResponse)
async def read_workspace_file(
    workspace_id: int,
    path: str = Query(..., description="File path to read"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Read a file's content from the workspace."""
    service = WorkspaceService(db)
    try:
        result = await service.read_file(workspace_id, current_user.id, path)
        return FileContentResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{workspace_id}/files/write")
async def write_workspace_file(
    workspace_id: int,
    request: FileWriteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Write/update a file in the workspace."""
    service = WorkspaceService(db)
    try:
        result = await service.write_file(
            workspace_id, current_user.id, request.path, request.content
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{workspace_id}/files/create")
async def create_workspace_file(
    workspace_id: int,
    request: FileCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new file or directory in the workspace."""
    service = WorkspaceService(db)
    try:
        result = await service.create_file(
            workspace_id, current_user.id, request.path,
            is_directory=request.is_directory, content=request.content or ""
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{workspace_id}/files")
async def delete_workspace_file(
    workspace_id: int,
    path: str = Query(..., description="File path to delete"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a file or directory from the workspace."""
    service = WorkspaceService(db)
    try:
        result = await service.delete_file(workspace_id, current_user.id, path)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Live preview ───────────────────────────────────────────────


def _preview_claims(token: str, workspace_id: int, port: int) -> dict:
    """Validate a preview token and return its claims."""
    payload = decode_preview_token(token)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired preview token")
    if int(payload.get("workspace_id", -1)) != workspace_id:
        raise HTTPException(status_code=403, detail="Preview token is for another workspace")
    if int(payload.get("port", -1)) != port:
        raise HTTPException(status_code=403, detail="Preview token is for another port")
    if not payload.get("sub"):
        raise HTTPException(status_code=401, detail="Invalid preview token")
    return payload


@router.post("/{workspace_id}/preview-token", response_model=PreviewTokenResponse)
async def create_workspace_preview_token(
    workspace_id: int,
    request: PreviewTokenRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mint a short-lived token for the iframe preview proxy."""
    service = WorkspaceService(db)
    workspace = await service.get_workspace(workspace_id, current_user.id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    if workspace.status != "running":
        raise HTTPException(status_code=400, detail="Workspace is not running")

    ports = await service.get_workspace_ports(workspace_id, current_user.id)
    if str(request.port) not in ports:
        raise HTTPException(
            status_code=400,
            detail=f"Port {request.port} is not exposed on this workspace container.",
        )

    token = create_preview_token(current_user.id, workspace_id, request.port)
    return PreviewTokenResponse(
        token=token,
        expires_in=settings.preview_token_expire_minutes * 60,
    )


async def _resolve_preview_port(
    service: WorkspaceService, workspace_id: int, user_id: int, port: int
) -> int:
    workspace = await service.get_workspace(workspace_id, user_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    ports = await service.get_workspace_ports(workspace_id, user_id)
    host_port = ports.get(str(port))
    if not host_port:
        raise HTTPException(
            status_code=400,
            detail=f"Port {port} is not exposed on this workspace container.",
        )
    return host_port


async def _proxy_http(
    request: Request,
    workspace_id: int,
    port: int,
    path: str,
    user_id: int,
    db: AsyncSession,
    token: str | None = None,
) -> Response:
    """Forward an HTTP request to the container's published dev-server port."""
    service = WorkspaceService(db)
    host_port = await _resolve_preview_port(service, workspace_id, user_id, port)

    query_str = f"?{request.url.query}" if request.url.query else ""
    target_url = (
        f"http://{settings.preview_connect_host}:{host_port}/"
        f"{path.lstrip('/')}{query_str}"
    )

    body = await request.body()
    headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower()
        not in ("host", "content-length", "authorization", "cookie", "accept-encoding")
    }

    client = httpx.AsyncClient(follow_redirects=False, timeout=30.0)
    try:
        req = client.build_request(
            method=request.method,
            url=target_url,
            headers=headers,
            content=body,
        )
        resp = await client.send(req, stream=True)
    except httpx.ConnectError:
        await client.aclose()
        raise HTTPException(
            status_code=502,
            detail=f"Development server on port {port} is not running or refused connection.",
        )
    except Exception as e:
        await client.aclose()
        logger.warning("Preview proxy error for workspace %s port %s: %s", workspace_id, port, e)
        raise HTTPException(
            status_code=502,
            detail=f"Error connecting to sandbox dev server: {e}",
        )

    response_headers = dict(resp.headers)
    for header in (
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailers",
        "transfer-encoding",
        "upgrade",
        "content-length",
    ):
        response_headers.pop(header, None)
        response_headers.pop(header.upper(), None)
    response_headers["Referrer-Policy"] = "no-referrer"

    # Keep absolute redirects inside the proxy prefix.
    if token:
        location = response_headers.get("location") or response_headers.get("Location")
        if location and location.startswith("/") and not location.startswith("//"):
            response_headers["Location"] = (
                f"/api/v1/workspace/{workspace_id}/proxy/{token}/{port}{location}"
            )

    content_type = response_headers.get("content-type", "").lower()
    base_path = (
        f"/api/v1/workspace/{workspace_id}/proxy/{token}/{port}/"
        if token
        else f"/api/v1/workspace/{workspace_id}/proxy/{port}/"
    )
    if ("text/html" in content_type or "text/css" in content_type):
        content = await resp.aread()
        await resp.aclose()
        await client.aclose()
        if len(content) <= 5 * 1024 * 1024:
            text = content.decode("utf-8", errors="replace")
            text = rewrite_html(text, base_path) if "text/html" in content_type else rewrite_css(text, base_path)
            content = text.encode("utf-8")
        response_headers.pop("content-encoding", None)
        response_headers.pop("Content-Encoding", None)
        response_headers.pop("content-type", None)
        response_headers.pop("Content-Type", None)
        return Response(
            content=content,
            status_code=resp.status_code,
            media_type=content_type or None,
            headers=response_headers,
        )

    async def generate():
        try:
            async for chunk in resp.aiter_raw():
                yield chunk
        finally:
            await resp.aclose()
            await client.aclose()

    return StreamingResponse(
        generate(),
        status_code=resp.status_code,
        headers=response_headers,
    )


@router.api_route(
    "/{workspace_id}/proxy/{token}/{port}/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
)
async def workspace_proxy_with_token(
    workspace_id: int,
    token: str,
    port: int,
    path: str = "",
    request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    """Authenticated-by-token proxy used by the preview iframe."""
    payload = _preview_claims(token, workspace_id, port)
    try:
        user_id = int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid preview token")
    return await _proxy_http(request, workspace_id, port, path, user_id, db, token=token)


@router.api_route(
    "/{workspace_id}/proxy/{port}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
)
@router.api_route(
    "/{workspace_id}/proxy/{port}/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
)
async def workspace_proxy(
    workspace_id: int,
    port: int,
    path: str = "",
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Legacy Bearer-authenticated proxy (kept for API clients)."""
    return await _proxy_http(
        request, workspace_id, port, path, current_user.id, db
    )


@router.websocket("/{workspace_id}/proxy/{token}/{port}/{path:path}")
async def workspace_proxy_ws(
    websocket: WebSocket,
    workspace_id: int,
    token: str,
    port: int,
    path: str = "",
):
    """Proxy WebSocket upgrades so dev-server HMR works through the preview."""
    try:
        payload = _preview_claims(token, workspace_id, port)
        user_id = int(payload["sub"])
    except (HTTPException, KeyError, TypeError, ValueError):
        await websocket.close(code=1008)
        return

    async with async_session_maker() as db:
        service = WorkspaceService(db)
        try:
            host_port = await _resolve_preview_port(service, workspace_id, user_id, port)
        except HTTPException:
            await websocket.close(code=1008)
            return

    query = f"?{websocket.url.query}" if websocket.url.query else ""
    target_url = (
        f"ws://{settings.preview_connect_host}:{host_port}/"
        f"{path.lstrip('/')}{query}"
    )
    requested_protocols = [
        p.strip()
        for p in websocket.headers.get("sec-websocket-protocol", "").split(",")
        if p.strip()
    ]

    try:
        upstream = await websockets.connect(
            target_url,
            subprotocols=requested_protocols or None,
            open_timeout=10,
            close_timeout=5,
            max_size=None,
            ping_interval=20,
        )
    except Exception as e:
        logger.debug("Preview WebSocket upstream refused: %s", e)
        await websocket.close(code=1011)
        return

    await websocket.accept(subprotocol=upstream.subprotocol)

    async def client_to_upstream() -> None:
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                return
            if message.get("text") is not None:
                await upstream.send(message["text"])
            elif message.get("bytes") is not None:
                await upstream.send(message["bytes"])

    async def upstream_to_client() -> None:
        async for message in upstream:
            if isinstance(message, bytes):
                await websocket.send_bytes(message)
            else:
                await websocket.send_text(message)

    tasks = [
        asyncio.create_task(client_to_upstream()),
        asyncio.create_task(upstream_to_client()),
    ]
    try:
        done, pending = await asyncio.wait(
            tasks, return_when=asyncio.FIRST_COMPLETED
        )
        for task in pending:
            task.cancel()
        with suppress(asyncio.CancelledError, Exception):
            await asyncio.gather(*pending, return_exceptions=True)
        for task in done:
            exc = task.exception()
            if exc and not isinstance(exc, WebSocketDisconnect):
                logger.debug("Preview WebSocket closed: %s", exc)
    finally:
        for task in tasks:
            task.cancel()
        with suppress(Exception):
            await upstream.close()
        with suppress(Exception):
            await websocket.close()
