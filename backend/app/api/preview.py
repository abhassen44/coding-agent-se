"""API routes for Phase 4E live preview management."""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field

from app.services.preview_service import PreviewService
from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/preview", tags=["Preview"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class PreviewStartRequest(BaseModel):
    command: str = Field(..., description="Dev server command to run, e.g. 'npm run dev'")
    port: int = Field(3000, ge=1, le=65535, description="Port the dev server listens on inside the container")


class PreviewStartResponse(BaseModel):
    running: bool
    host_port: int
    app_port: int
    command: str
    reachable: bool
    proxy_url: str


class PreviewStatusResponse(BaseModel):
    running: bool
    host_port: int | None = None
    app_port: int | None = None
    command: str | None = None
    reachable: bool | None = None
    started_at: str | None = None
    proxy_url: str | None = None
    error: str | None = None


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/{workspace_id}/start", response_model=PreviewStartResponse)
async def start_preview(
    workspace_id: int,
    request: PreviewStartRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Start a dev server inside the workspace and set up port forwarding."""
    service = PreviewService(db)
    try:
        result = await service.start_preview(
            workspace_id=workspace_id,
            user_id=current_user.id,
            command=request.command,
            app_port=request.port,
        )
        return PreviewStartResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error starting preview for workspace {workspace_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Preview start failed: {str(e)}")


@router.post("/{workspace_id}/stop")
async def stop_preview(
    workspace_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Stop the dev server and remove port forwarding."""
    service = PreviewService(db)
    try:
        result = await service.stop_preview(workspace_id, current_user.id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{workspace_id}/status", response_model=PreviewStatusResponse)
async def preview_status(
    workspace_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current preview status."""
    service = PreviewService(db)
    try:
        result = await service.get_preview_status(workspace_id, current_user.id)
        return PreviewStatusResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{workspace_id}/proxy/{path:path}")
async def proxy_preview(
    workspace_id: int,
    path: str,
    request: Request,
    token: str = Query(..., description="JWT auth token"),
    db: AsyncSession = Depends(get_db),
):
    """Reverse proxy requests to the running dev server.

    Auth is via query param `token` since iframes can't set Authorization headers.
    """
    # Manual auth via query param token
    from app.core.security import decode_token
    from app.services.auth_service import AuthService

    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token")

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid token")

    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")

    # Verify user exists
    auth_service = AuthService(db)
    user = await auth_service.get_user_by_id(user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    # Proxy the request
    service = PreviewService(db)
    try:
        headers = dict(request.headers)
        body = await request.body() if request.method in ("POST", "PUT", "PATCH") else None

        response = await service.proxy_request(
            workspace_id=workspace_id,
            path=path,
            method=request.method,
            headers=headers,
            body=body,
        )

        # Build response headers — filter hop-by-hop headers
        skip_headers = {
            "transfer-encoding", "connection", "keep-alive",
            "proxy-authenticate", "proxy-authorization", "te",
            "trailers", "upgrade", "content-encoding",
        }
        resp_headers = {}
        for k, v in response.headers.items():
            if k.lower() not in skip_headers:
                resp_headers[k] = v

        # Remove X-Frame-Options and CSP that would block iframe embedding
        resp_headers.pop("x-frame-options", None)
        resp_headers.pop("X-Frame-Options", None)
        resp_headers.pop("content-security-policy", None)
        resp_headers.pop("Content-Security-Policy", None)

        return Response(
            content=response.content,
            status_code=response.status_code,
            headers=resp_headers,
            media_type=response.headers.get("content-type", "text/html"),
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Proxy error for workspace {workspace_id}: {e}")
        raise HTTPException(status_code=502, detail=f"Preview proxy error: {str(e)}")
