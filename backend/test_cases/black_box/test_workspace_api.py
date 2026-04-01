"""
BLACK BOX TESTS — /api/v1/workspace  (CRUD lifecycle)
=======================================================
Black Box Testing: tests interact with the workspace HTTP API as an
external user would — no knowledge of Docker internals or DB schema.

API Surface under test:
  POST   /api/v1/workspace/create         → 200 WorkspaceResponse | 400 validation
  GET    /api/v1/workspace                → 200 WorkspaceListResponse
  GET    /api/v1/workspace/{id}           → 200 WorkspaceResponse  | 404
  POST   /api/v1/workspace/{id}/start     → 200 WorkspaceResponse  | 400
  POST   /api/v1/workspace/{id}/stop      → 200 WorkspaceResponse  | 400
  DELETE /api/v1/workspace/{id}           → 200 message            | 400
  GET    /api/v1/workspace/{id}/files     → 200 FileTreeResponse   | 400
  GET    /api/v1/workspace/{id}/files/read→ 200 FileContentResponse| 400
  POST   /api/v1/workspace/{id}/files/write → 200 | 400
  POST   /api/v1/workspace/{id}/files/create → 200 | 400
  DELETE /api/v1/workspace/{id}/files     → 200 | 400

All tests that touch Docker are mocked at the service level so they
can run in CI without a real daemon.
"""

import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient

from app.services.workspace_service import WorkspaceService
from app.models.workspace import Workspace

BASE = "/api/v1/workspace"
AUTH_BASE = "/api/v1/auth"


def _make_ws(**kwargs) -> MagicMock:
    """Build a MagicMock that quacks like a Workspace ORM instance.

    Using MagicMock avoids SQLAlchemy's _sa_instance_state requirement while
    still allowing Pydantic's model_validate() to read all attributes.
    """
    defaults = dict(
        id=1,
        user_id=1,
        name="test-repo",
        status="running",
        base_image="node:20-bookworm",
        work_dir="/workspace",
        container_id=None,
        volume_name=None,
        repo_id=None,
        repo_url=None,
        error_message=None,
        last_accessed_at=None,
        created_at=datetime(2025, 1, 1, 0, 0, 0),
    )
    defaults.update(kwargs)
    mock_ws = MagicMock(spec=Workspace)
    for k, v in defaults.items():
        setattr(mock_ws, k, v)
    return mock_ws


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

async def register_and_login(client: AsyncClient, email: str, password: str = "Pass123!") -> str:
    """Register a user and return bearer access token."""
    await client.post(f"{AUTH_BASE}/register", json={
        "email": email, "password": password, "full_name": "WS Test User"
    })
    resp = await client.post(f"{AUTH_BASE}/login", json={"email": email, "password": password})
    return resp.json()["access_token"]


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ─────────────────────────────────────────────────────────────────────────────
# BB-WS-01 … BB-WS-06  │  POST /create
# ─────────────────────────────────────────────────────────────────────────────

class TestWorkspaceCreate:
    """Black Box: workspace creation endpoint."""

    @pytest.mark.asyncio
    async def test_bb_ws_01_create_with_repo_url_returns_200(self, client: AsyncClient):
        """BB-WS-01: valid repo_url → 200 with workspace response body."""
        token = await register_and_login(client, "ws_create@test.com")
        fake_ws = _make_ws(status="creating", repo_url="https://github.com/example/repo")
        # Patch the module-level class method so the fresh service instance inside
        # the route handler is still intercepted.
        with patch(
            "app.api.workspace.WorkspaceService.create_workspace",
            new_callable=lambda: lambda *a, **kw: AsyncMock(return_value=fake_ws)
        ):
            with patch.object(WorkspaceService, "create_workspace", new=AsyncMock(return_value=fake_ws)):
                resp = await client.post(f"{BASE}/create", json={
                    "repo_url": "https://github.com/example/repo",
                    "name": "my-repo",
                }, headers=auth_header(token))
        assert resp.status_code == 200
        body = resp.json()
        assert "id" in body
        assert "status" in body

    @pytest.mark.asyncio
    async def test_bb_ws_02_create_without_repo_returns_400(self, client: AsyncClient):
        """BB-WS-02: neither repo_url nor repo_id → 400 Bad Request."""
        token = await register_and_login(client, "ws_norepo@test.com")
        resp = await client.post(f"{BASE}/create", json={
            "name": "orphan-workspace"
        }, headers=auth_header(token))
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_bb_ws_03_create_requires_authentication(self, client: AsyncClient):
        """BB-WS-03: unauthenticated request → 401 or 403."""
        resp = await client.post(f"{BASE}/create", json={
            "repo_url": "https://github.com/example/repo"
        })
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_bb_ws_04_create_error_returns_400(self, client: AsyncClient):
        """BB-WS-04: service raises ValueError (e.g., Docker not available) → 400."""
        token = await register_and_login(client, "ws_err@test.com")
        with patch.object(WorkspaceService, "create_workspace", new_callable=AsyncMock) as mock_create:
            mock_create.side_effect = ValueError("Repository not found")
            resp = await client.post(f"{BASE}/create", json={
                "repo_url": "https://github.com/x/y",
            }, headers=auth_header(token))
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_bb_ws_05_create_runtime_error_returns_400(self, client: AsyncClient):
        """BB-WS-05: RuntimeError from service (Docker unavailable) → 400."""
        token = await register_and_login(client, "ws_runtime@test.com")
        with patch.object(WorkspaceService, "create_workspace", new_callable=AsyncMock) as mock_create:
            mock_create.side_effect = RuntimeError("Docker is not available")
            resp = await client.post(f"{BASE}/create", json={
                "repo_url": "https://github.com/x/y",
            }, headers=auth_header(token))
        assert resp.status_code == 400


# ─────────────────────────────────────────────────────────────────────────────
# BB-WS-06 … BB-WS-10  │  GET / (list)
# ─────────────────────────────────────────────────────────────────────────────

class TestWorkspaceList:
    """Black Box: list workspaces endpoint."""

    @pytest.mark.asyncio
    async def test_bb_ws_06_list_returns_200(self, client: AsyncClient):
        """BB-WS-06: authenticated list request → 200 with workspaces array."""
        token = await register_and_login(client, "ws_list@test.com")
        with patch.object(WorkspaceService, "list_workspaces", new_callable=AsyncMock) as mock_list:
            mock_list.return_value = ([], 0)
            resp = await client.get(BASE, headers=auth_header(token))
        assert resp.status_code == 200
        body = resp.json()
        assert "workspaces" in body
        assert "total" in body

    @pytest.mark.asyncio
    async def test_bb_ws_07_list_unauthenticated_returns_401(self, client: AsyncClient):
        """BB-WS-07: no auth header → 401 or 403."""
        resp = await client.get(BASE)
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_bb_ws_08_list_accepts_limit_and_offset(self, client: AsyncClient):
        """BB-WS-08: query params limit and offset are accepted."""
        token = await register_and_login(client, "ws_paging@test.com")
        with patch.object(WorkspaceService, "list_workspaces", new_callable=AsyncMock) as mock_list:
            mock_list.return_value = ([], 0)
            resp = await client.get(f"{BASE}?limit=5&offset=10", headers=auth_header(token))
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_bb_ws_09_limit_over_50_returns_422(self, client: AsyncClient):
        """BB-WS-09: limit > 50 violates schema constraint → 422."""
        token = await register_and_login(client, "ws_biglimit@test.com")
        resp = await client.get(f"{BASE}?limit=100", headers=auth_header(token))
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_bb_ws_10_negative_offset_returns_422(self, client: AsyncClient):
        """BB-WS-10: offset < 0 violates ge=0 constraint → 422."""
        token = await register_and_login(client, "ws_negoffset@test.com")
        resp = await client.get(f"{BASE}?offset=-1", headers=auth_header(token))
        assert resp.status_code == 422


# ─────────────────────────────────────────────────────────────────────────────
# BB-WS-11 … BB-WS-14  │  GET /{id}
# ─────────────────────────────────────────────────────────────────────────────

class TestWorkspaceGet:
    """Black Box: get single workspace endpoint."""

    @pytest.mark.asyncio
    async def test_bb_ws_11_get_existing_workspace(self, client: AsyncClient):
        """BB-WS-11: valid workspace ID → 200 with workspace data."""
        token = await register_and_login(client, "ws_get@test.com")
        fake_ws = _make_ws(id=42, name="get-test")
        with patch.object(WorkspaceService, "get_workspace", new=AsyncMock(return_value=fake_ws)):
            resp = await client.get(f"{BASE}/42", headers=auth_header(token))
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_bb_ws_12_get_nonexistent_returns_404(self, client: AsyncClient):
        """BB-WS-12: workspace not found → 404 Not Found."""
        token = await register_and_login(client, "ws_notfound@test.com")
        with patch.object(WorkspaceService, "get_workspace", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = None
            resp = await client.get(f"{BASE}/99999", headers=auth_header(token))
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_bb_ws_13_get_unauthenticated_returns_401(self, client: AsyncClient):
        """BB-WS-13: no auth header → 401 or 403."""
        resp = await client.get(f"{BASE}/1")
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_bb_ws_14_get_response_has_status_field(self, client: AsyncClient):
        """BB-WS-14: response body includes workspace status."""
        token = await register_and_login(client, "ws_status@test.com")
        fake_ws = _make_ws(id=1, name="status-test")
        with patch.object(WorkspaceService, "get_workspace", new=AsyncMock(return_value=fake_ws)):
            resp = await client.get(f"{BASE}/1", headers=auth_header(token))
        body = resp.json()
        assert "status" in body


# ─────────────────────────────────────────────────────────────────────────────
# BB-WS-15 … BB-WS-18  │  POST /{id}/start and /{id}/stop
# ─────────────────────────────────────────────────────────────────────────────

class TestWorkspaceStartStop:
    """Black Box: start/stop lifecycle endpoints."""

    @pytest.mark.asyncio
    async def test_bb_ws_15_start_returns_200(self, client: AsyncClient):
        """BB-WS-15: start a stopped workspace → 200 with updated status."""
        token = await register_and_login(client, "ws_start@test.com")
        fake_ws = _make_ws(id=1, name="start-test", status="running")
        with patch.object(WorkspaceService, "start_workspace", new=AsyncMock(return_value=fake_ws)):
            resp = await client.post(f"{BASE}/1/start", headers=auth_header(token))
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_bb_ws_16_start_error_returns_400(self, client: AsyncClient):
        """BB-WS-16: service raises ValueError on start → 400."""
        token = await register_and_login(client, "ws_starterr@test.com")
        with patch.object(WorkspaceService, "start_workspace", new_callable=AsyncMock) as mock_start:
            mock_start.side_effect = ValueError("Workspace not found")
            resp = await client.post(f"{BASE}/1/start", headers=auth_header(token))
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_bb_ws_17_stop_returns_200(self, client: AsyncClient):
        """BB-WS-17: stop a running workspace → 200 with updated status."""
        token = await register_and_login(client, "ws_stop@test.com")
        fake_ws = _make_ws(id=1, name="stop-test", status="stopped")
        with patch.object(WorkspaceService, "stop_workspace", new=AsyncMock(return_value=fake_ws)):
            resp = await client.post(f"{BASE}/1/stop", headers=auth_header(token))
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_bb_ws_18_stop_error_returns_400(self, client: AsyncClient):
        """BB-WS-18: service raises ValueError on stop → 400."""
        token = await register_and_login(client, "ws_stoperr@test.com")
        with patch.object(WorkspaceService, "stop_workspace", new_callable=AsyncMock) as mock_stop:
            mock_stop.side_effect = ValueError("No container associated")
            resp = await client.post(f"{BASE}/1/stop", headers=auth_header(token))
        assert resp.status_code == 400


# ─────────────────────────────────────────────────────────────────────────────
# BB-WS-19 … BB-WS-21  │  DELETE /{id}
# ─────────────────────────────────────────────────────────────────────────────

class TestWorkspaceDestroy:
    """Black Box: workspace deletion endpoint."""

    @pytest.mark.asyncio
    async def test_bb_ws_19_destroy_returns_success_message(self, client: AsyncClient):
        """BB-WS-19: successful destroy → 200 with message."""
        token = await register_and_login(client, "ws_destroy@test.com")
        with patch.object(WorkspaceService, "destroy_workspace", new_callable=AsyncMock):
            resp = await client.delete(f"{BASE}/1", headers=auth_header(token))
        assert resp.status_code == 200
        body = resp.json()
        assert "message" in body

    @pytest.mark.asyncio
    async def test_bb_ws_20_destroy_error_returns_400(self, client: AsyncClient):
        """BB-WS-20: service raises ValueError → 400."""
        token = await register_and_login(client, "ws_destroyerr@test.com")
        with patch.object(WorkspaceService, "destroy_workspace", new_callable=AsyncMock) as mock_destroy:
            mock_destroy.side_effect = ValueError("Workspace not found")
            resp = await client.delete(f"{BASE}/1", headers=auth_header(token))
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_bb_ws_21_destroy_unauthenticated_returns_401(self, client: AsyncClient):
        """BB-WS-21: unauthenticated destroy → 401 or 403."""
        resp = await client.delete(f"{BASE}/1")
        assert resp.status_code in (401, 403)


# ─────────────────────────────────────────────────────────────────────────────
# BB-WS-22 … BB-WS-28  │  File operations
# ─────────────────────────────────────────────────────────────────────────────

class TestWorkspaceFileOps:
    """Black Box: file system API endpoints."""

    @pytest.mark.asyncio
    async def test_bb_ws_22_list_files_returns_entries(self, client: AsyncClient):
        """BB-WS-22: list files → 200 with path and entries array."""
        token = await register_and_login(client, "ws_files@test.com")
        with patch.object(WorkspaceService, "list_files", new_callable=AsyncMock) as mock_list:
            mock_list.return_value = [
                {"name": "README.md", "path": "README.md", "type": "file", "size": 100}
            ]
            resp = await client.get(f"{BASE}/1/files?path=.", headers=auth_header(token))
        assert resp.status_code == 200
        body = resp.json()
        assert "entries" in body
        assert "path" in body

    @pytest.mark.asyncio
    async def test_bb_ws_23_list_files_error_returns_400(self, client: AsyncClient):
        """BB-WS-23: service raises ValueError → 400."""
        token = await register_and_login(client, "ws_fileserr@test.com")
        with patch.object(WorkspaceService, "list_files", new_callable=AsyncMock) as mock_list:
            mock_list.side_effect = ValueError("Workspace is not running")
            resp = await client.get(f"{BASE}/1/files", headers=auth_header(token))
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_bb_ws_24_read_file_returns_content(self, client: AsyncClient):
        """BB-WS-24: read existing file → 200 with content field."""
        token = await register_and_login(client, "ws_readfile@test.com")
        with patch.object(WorkspaceService, "read_file", new_callable=AsyncMock) as mock_read:
            mock_read.return_value = {
                "path": "src/index.py",
                "content": "print('hello')",
                "language": "python",
            }
            resp = await client.get(
                f"{BASE}/1/files/read?path=src/index.py",
                headers=auth_header(token)
            )
        assert resp.status_code == 200
        body = resp.json()
        assert "content" in body
        assert "path" in body

    @pytest.mark.asyncio
    async def test_bb_ws_25_write_file_returns_200(self, client: AsyncClient):
        """BB-WS-25: write valid file → 200."""
        token = await register_and_login(client, "ws_writefile@test.com")
        with patch.object(WorkspaceService, "write_file", new_callable=AsyncMock) as mock_write:
            mock_write.return_value = {"path": "out.txt", "status": "written"}
            resp = await client.post(f"{BASE}/1/files/write", json={
                "path": "out.txt",
                "content": "Hello World",
            }, headers=auth_header(token))
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_bb_ws_26_create_file_returns_200(self, client: AsyncClient):
        """BB-WS-26: create new file → 200."""
        token = await register_and_login(client, "ws_createfile@test.com")
        with patch.object(WorkspaceService, "create_file", new_callable=AsyncMock) as mock_create:
            mock_create.return_value = {"path": "new.txt", "type": "file", "status": "created"}
            resp = await client.post(f"{BASE}/1/files/create", json={
                "path": "new.txt",
                "is_directory": False,
            }, headers=auth_header(token))
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_bb_ws_27_delete_file_returns_200(self, client: AsyncClient):
        """BB-WS-27: delete an existing file → 200."""
        token = await register_and_login(client, "ws_delfile@test.com")
        with patch.object(WorkspaceService, "delete_file", new_callable=AsyncMock) as mock_del:
            mock_del.return_value = {"path": "old.txt", "status": "deleted"}
            resp = await client.delete(
                f"{BASE}/1/files?path=old.txt",
                headers=auth_header(token)
            )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_bb_ws_28_delete_file_error_returns_400(self, client: AsyncClient):
        """BB-WS-28: workspace root deletion attempt → 400."""
        token = await register_and_login(client, "ws_delroot@test.com")
        with patch.object(WorkspaceService, "delete_file", new_callable=AsyncMock) as mock_del:
            mock_del.side_effect = ValueError("Cannot delete workspace root directory")
            resp = await client.delete(
                f"{BASE}/1/files?path=.",
                headers=auth_header(token)
            )
        assert resp.status_code == 400
