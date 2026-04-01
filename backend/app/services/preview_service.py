"""Preview service for Phase 4E — Live preview of running apps inside workspaces.

Uses a companion Docker container to forward ports from the workspace container
to the host, and Redis to store ephemeral preview state (no SQL migration needed).
"""
import json
import socket
import asyncio
import logging
from datetime import datetime
from typing import Optional

import docker
import httpx
from docker.errors import NotFound, APIError, ImageNotFound
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.workspace import Workspace
from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────
REDIS_KEY_PREFIX = "preview"
REDIS_TTL = 86400  # 24 hours
PORT_RANGE_START = 34500
PORT_RANGE_END = 34599
SOCAT_IMAGE = "alpine/socat"
HEALTH_PROBE_TIMEOUT = 15  # seconds
HEALTH_PROBE_INTERVAL = 1  # seconds


def _get_redis():
    """Get a synchronous Redis client."""
    import redis
    return redis.Redis.from_url(settings.redis_url, decode_responses=True)


def _redis_key(workspace_id: int) -> str:
    return f"{REDIS_KEY_PREFIX}:{workspace_id}"


class PreviewService:
    """Manages live preview of running dev servers inside workspace containers."""

    def __init__(self, db: AsyncSession):
        self.db = db
        try:
            self.docker_client = docker.from_env()
        except Exception as e:
            logger.warning(f"Docker client not available: {e}")
            self.docker_client = None

    # ── Start Preview ──────────────────────────────────────────────────────────

    async def start_preview(
        self, workspace_id: int, user_id: int, command: str, app_port: int = 3000
    ) -> dict:
        """Start a dev server and companion port-forward container."""
        workspace = await self._get_running_workspace(workspace_id, user_id)

        # Check if already running
        existing = self._get_redis_state(workspace_id)
        if existing and existing.get("running"):
            return existing

        # Find a free host port
        host_port = await asyncio.get_event_loop().run_in_executor(
            None, self._find_free_port
        )
        if not host_port:
            raise RuntimeError("No free ports available in range 34500-34599")

        # Step 1: Start the dev server inside the workspace container
        await asyncio.get_event_loop().run_in_executor(
            None,
            self._start_dev_server,
            workspace.container_id,
            command,
        )

        # Step 2: Start companion container for port forwarding
        companion_id = await asyncio.get_event_loop().run_in_executor(
            None,
            self._start_companion,
            workspace.container_id,
            workspace.name,
            host_port,
            app_port,
        )

        # Step 3: Wait for port to become reachable
        reachable = await self._wait_for_port(host_port)

        # Step 4: Save state to Redis
        state = {
            "running": True,
            "workspace_id": workspace_id,
            "host_port": host_port,
            "app_port": app_port,
            "command": command,
            "companion_id": companion_id,
            "container_id": workspace.container_id,
            "started_at": datetime.utcnow().isoformat(),
            "reachable": reachable,
        }
        self._set_redis_state(workspace_id, state)

        return {
            "running": True,
            "host_port": host_port,
            "app_port": app_port,
            "command": command,
            "reachable": reachable,
            "proxy_url": f"/api/v1/preview/{workspace_id}/proxy/",
        }

    # ── Stop Preview ───────────────────────────────────────────────────────────

    async def stop_preview(self, workspace_id: int, user_id: int) -> dict:
        """Stop the dev server and remove the companion container."""
        await self._get_running_workspace(workspace_id, user_id)

        state = self._get_redis_state(workspace_id)
        if not state:
            return {"stopped": True, "message": "No preview was running"}

        # Kill companion container
        companion_id = state.get("companion_id")
        if companion_id:
            await asyncio.get_event_loop().run_in_executor(
                None, self._stop_companion, companion_id
            )

        # Kill the dev server process on the app port
        container_id = state.get("container_id")
        app_port = state.get("app_port")
        if container_id and app_port:
            await asyncio.get_event_loop().run_in_executor(
                None, self._kill_port_process, container_id, app_port
            )

        # Clear Redis state
        self._delete_redis_state(workspace_id)

        return {"stopped": True}

    # ── Status ─────────────────────────────────────────────────────────────────

    async def get_preview_status(self, workspace_id: int, user_id: int) -> dict:
        """Get current preview status from Redis."""
        await self._verify_ownership(workspace_id, user_id)

        state = self._get_redis_state(workspace_id)
        if not state:
            return {"running": False}

        # Verify companion container is still alive
        companion_id = state.get("companion_id")
        if companion_id:
            alive = await asyncio.get_event_loop().run_in_executor(
                None, self._is_container_alive, companion_id
            )
            if not alive:
                self._delete_redis_state(workspace_id)
                return {"running": False, "error": "Preview companion stopped unexpectedly"}

        return {
            "running": state.get("running", False),
            "host_port": state.get("host_port"),
            "app_port": state.get("app_port"),
            "command": state.get("command"),
            "reachable": state.get("reachable", False),
            "started_at": state.get("started_at"),
            "proxy_url": f"/api/v1/preview/{workspace_id}/proxy/",
        }

    # ── Proxy ──────────────────────────────────────────────────────────────────

    async def proxy_request(
        self,
        workspace_id: int,
        path: str,
        method: str = "GET",
        headers: Optional[dict] = None,
        body: Optional[bytes] = None,
    ) -> httpx.Response:
        """Proxy an HTTP request to the dev server via the host port."""
        state = self._get_redis_state(workspace_id)
        if not state or not state.get("running"):
            raise ValueError("No preview is running for this workspace")

        host_port = state["host_port"]
        url = f"http://localhost:{host_port}/{path.lstrip('/')}"

        # Clean headers for proxying
        proxy_headers = {}
        if headers:
            skip = {"host", "connection", "transfer-encoding", "upgrade"}
            for k, v in headers.items():
                if k.lower() not in skip:
                    proxy_headers[k] = v

        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            response = await client.request(
                method=method,
                url=url,
                headers=proxy_headers,
                content=body,
            )
            return response

    # ── Docker Helpers ─────────────────────────────────────────────────────────

    def _start_dev_server(self, container_id: str, command: str) -> None:
        """Run the dev server command inside the workspace container (detached)."""
        try:
            container = self.docker_client.containers.get(container_id)
            # Kill any existing dev servers on the workspace first (best-effort)
            container.exec_run(
                "bash -c 'pkill -f \"npm\\|node\\|python.*http.server\\|uvicorn\" 2>/dev/null || true'",
                workdir="/workspace",
            )
            # Start the dev server as a detached process
            container.exec_run(
                f"bash -c 'cd /workspace && {command} &'",
                workdir="/workspace",
                detach=True,
            )
            logger.info(f"Started dev server in container {container_id[:12]}: {command}")
        except NotFound:
            raise ValueError("Workspace container not found")
        except APIError as e:
            raise RuntimeError(f"Failed to start dev server: {e}")

    def _start_companion(
        self, workspace_container_id: str, workspace_name: str,
        host_port: int, app_port: int
    ) -> str:
        """Start a companion container for port forwarding."""
        # Ensure socat image is available
        try:
            self.docker_client.images.get(SOCAT_IMAGE)
        except ImageNotFound:
            logger.info(f"Pulling {SOCAT_IMAGE}...")
            self.docker_client.images.pull(SOCAT_IMAGE)

        companion_name = f"ica_preview_{workspace_name}_{host_port}"

        # Remove any old companion with the same name
        try:
            old = self.docker_client.containers.get(companion_name)
            old.remove(force=True)
        except NotFound:
            pass

        # Get workspace container's IP and main network
        ws_container = self.docker_client.containers.get(workspace_container_id)
        networks = ws_container.attrs['NetworkSettings']['Networks']
        if not networks:
            raise RuntimeError("Workspace container is not attached to any network")
        
        network_name = list(networks.keys())[0]
        workspace_ip = list(networks.values())[0]['IPAddress']

        # Run companion attached to the same network, exposing port to host
        companion = self.docker_client.containers.run(
            image=SOCAT_IMAGE,
            command=f"TCP-LISTEN:{app_port},fork,reuseaddr TCP4:{workspace_ip}:{app_port}",
            name=companion_name,
            network=network_name,
            ports={f"{app_port}/tcp": host_port},
            detach=True,
            auto_remove=True,
        )
        logger.info(
            f"Started companion {companion.id[:12]} "
            f"forwarding host:{host_port} → {workspace_ip}:{app_port}"
        )
        return companion.id

    def _stop_companion(self, companion_id: str) -> None:
        """Stop and remove the companion container."""
        try:
            container = self.docker_client.containers.get(companion_id)
            container.stop(timeout=3)
        except NotFound:
            pass  # Already gone (auto_remove=True)
        except APIError as e:
            logger.warning(f"Error stopping companion: {e}")

    def _kill_port_process(self, container_id: str, app_port: int) -> None:
        """Kill processes listening on a port inside the workspace container."""
        try:
            container = self.docker_client.containers.get(container_id)
            container.exec_run(
                f"bash -c 'fuser -k {app_port}/tcp 2>/dev/null || true'",
                workdir="/workspace",
            )
        except (NotFound, APIError):
            pass

    def _is_container_alive(self, container_id: str) -> bool:
        """Check if a container is still running."""
        try:
            container = self.docker_client.containers.get(container_id)
            return container.status == "running"
        except NotFound:
            return False

    # ── Port Helper ────────────────────────────────────────────────────────────

    def _find_free_port(self) -> Optional[int]:
        """Find a free port in the preview range."""
        for port in range(PORT_RANGE_START, PORT_RANGE_END + 1):
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            try:
                result = sock.connect_ex(("localhost", port))
                if result != 0:
                    # Port is free
                    return port
            finally:
                sock.close()
        return None

    # ── Health Probe ───────────────────────────────────────────────────────────

    async def _wait_for_port(self, port: int) -> bool:
        """Wait for a port to become reachable on localhost."""
        for _ in range(HEALTH_PROBE_TIMEOUT):
            try:
                async with httpx.AsyncClient(timeout=2.0) as client:
                    resp = await client.get(f"http://localhost:{port}/")
                    if resp.status_code < 500:
                        return True
            except (httpx.ConnectError, httpx.ReadTimeout, httpx.ConnectTimeout):
                pass
            await asyncio.sleep(HEALTH_PROBE_INTERVAL)
        logger.warning(f"Port {port} not reachable after {HEALTH_PROBE_TIMEOUT}s")
        return False

    # ── Redis Helpers ──────────────────────────────────────────────────────────

    def _get_redis_state(self, workspace_id: int) -> Optional[dict]:
        """Read preview state from Redis."""
        try:
            r = _get_redis()
            data = r.get(_redis_key(workspace_id))
            return json.loads(data) if data else None
        except Exception as e:
            logger.warning(f"Redis read error: {e}")
            return None

    def _set_redis_state(self, workspace_id: int, state: dict) -> None:
        """Write preview state to Redis with TTL."""
        try:
            r = _get_redis()
            r.set(_redis_key(workspace_id), json.dumps(state), ex=REDIS_TTL)
        except Exception as e:
            logger.warning(f"Redis write error: {e}")

    def _delete_redis_state(self, workspace_id: int) -> None:
        """Delete preview state from Redis."""
        try:
            r = _get_redis()
            r.delete(_redis_key(workspace_id))
        except Exception as e:
            logger.warning(f"Redis delete error: {e}")

    # ── DB Helpers ─────────────────────────────────────────────────────────────

    async def _get_running_workspace(self, workspace_id: int, user_id: int) -> Workspace:
        """Get workspace and verify it is owned and running."""
        workspace = await self._verify_ownership(workspace_id, user_id)
        if workspace.status != "running":
            raise ValueError(f"Workspace is not running (status: {workspace.status})")
        if not workspace.container_id:
            raise ValueError("No container associated with this workspace")
        return workspace

    async def _verify_ownership(self, workspace_id: int, user_id: int) -> Workspace:
        """Verify workspace exists and belongs to user."""
        result = await self.db.execute(
            select(Workspace).where(
                Workspace.id == workspace_id,
                Workspace.user_id == user_id,
            )
        )
        workspace = result.scalar_one_or_none()
        if not workspace:
            raise ValueError("Workspace not found")
        return workspace
