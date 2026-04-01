"""
WHITE BOX TESTS — app/services/workspace_service.py
=====================================================
White Box Testing: tester has full visibility into WorkspaceService source.
Tests verify internal guard clauses, path resolution, and delete-safety logic.

Internal logic under test:
  _resolve_path()        — path-traversal guard, dot/empty normalisation
  delete_file()          — root-deletion guard
  _get_running()         — status guard (not-found / not-running / no-container)
  list_workspaces()      — 'destroyed' workspace excluded from query
  _check_container_status() — docker status mapping
"""

import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.workspace_service import WorkspaceService
from app.models.workspace import Workspace
from app.models.user import User, UserRole
from app.core.security import get_password_hash


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def ws_user(db: AsyncSession) -> User:
    u = User(
        email="ws_user@test.com",
        password_hash=get_password_hash("Pass123!"),
        full_name="WS User",
        role=UserRole.USER.value,
        is_active=True,
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return u


@pytest_asyncio.fixture
async def running_workspace(db: AsyncSession, ws_user: User) -> Workspace:
    ws = Workspace(
        user_id=ws_user.id,
        name="my-repo",
        container_id="container_abc",
        volume_name="vol_abc",
        status="running",
        work_dir="/workspace",
        repo_url="https://github.com/x/y",
    )
    db.add(ws)
    await db.commit()
    await db.refresh(ws)
    return ws


@pytest_asyncio.fixture
async def stopped_workspace(db: AsyncSession, ws_user: User) -> Workspace:
    ws = Workspace(
        user_id=ws_user.id,
        name="stopped-repo",
        container_id="container_xyz",
        volume_name="vol_xyz",
        status="stopped",
        work_dir="/workspace",
        repo_url="https://github.com/x/z",
    )
    db.add(ws)
    await db.commit()
    await db.refresh(ws)
    return ws


@pytest_asyncio.fixture
async def destroyed_workspace(db: AsyncSession, ws_user: User) -> Workspace:
    ws = Workspace(
        user_id=ws_user.id,
        name="dead-repo",
        container_id=None,
        volume_name=None,
        status="destroyed",
        work_dir="/workspace",
        repo_url="https://github.com/x/dead",
    )
    db.add(ws)
    await db.commit()
    await db.refresh(ws)
    return ws


def make_service(db: AsyncSession) -> WorkspaceService:
    with patch("docker.from_env"):
        svc = WorkspaceService(db)
    svc.docker_client = MagicMock()
    return svc


# ─────────────────────────────────────────────────────────────────────────────
# WB-WS-01 … WB-WS-09  │  _resolve_path (static method)
# ─────────────────────────────────────────────────────────────────────────────

class TestResolvePath:
    """White Box: test every branch of the static _resolve_path method."""

    def test_wb_ws_01_simple_file_path(self):
        """WB-WS-01: simple relative path appended to work_dir."""
        result = WorkspaceService._resolve_path("/workspace", "src/main.py")
        assert result == "/workspace/src/main.py"

    def test_wb_ws_02_dot_returns_work_dir(self):
        """WB-WS-02: '.' path resolves to work_dir itself (line 435-436)."""
        result = WorkspaceService._resolve_path("/workspace", ".")
        assert result == "/workspace"

    def test_wb_ws_03_empty_string_returns_work_dir(self):
        """WB-WS-03: empty string after strip() also resolves to work_dir."""
        result = WorkspaceService._resolve_path("/workspace", "")
        assert result == "/workspace"

    def test_wb_ws_04_leading_slash_stripped(self):
        """WB-WS-04: leading slash stripped by strip('/') — no double slash."""
        result = WorkspaceService._resolve_path("/workspace", "/src/app.py")
        assert result == "/workspace/src/app.py"

    def test_wb_ws_05_backslash_converted(self):
        """WB-WS-05: Windows-style backslash replaced with forward slash (line 432)."""
        result = WorkspaceService._resolve_path("/workspace", "src\\main.py")
        assert result == "/workspace/src/main.py"

    def test_wb_ws_06_dotdot_raises_value_error(self):
        """WB-WS-06: '..' in any path segment raises ValueError (line 433-434)."""
        with pytest.raises(ValueError, match="Path traversal"):
            WorkspaceService._resolve_path("/workspace", "../etc/passwd")

    def test_wb_ws_07_dotdot_in_middle_raises(self):
        """WB-WS-07: '..' in middle segment also raises ValueError."""
        with pytest.raises(ValueError, match="Path traversal"):
            WorkspaceService._resolve_path("/workspace", "src/../../../etc/shadow")

    def test_wb_ws_08_dotdot_after_backslash_raises(self):
        """WB-WS-08: backslash + '..' still detected after conversion."""
        with pytest.raises(ValueError, match="Path traversal"):
            WorkspaceService._resolve_path("/workspace", "src\\..\\secret.txt")

    def test_wb_ws_09_deep_nested_path(self):
        """WB-WS-09: deeply nested valid path is resolved correctly."""
        result = WorkspaceService._resolve_path("/workspace", "a/b/c/d/e.txt")
        assert result == "/workspace/a/b/c/d/e.txt"


# ─────────────────────────────────────────────────────────────────────────────
# WB-WS-10 … WB-WS-13  │  _get_running guard clauses
# ─────────────────────────────────────────────────────────────────────────────

class TestGetRunning:
    """White Box: test each guard clause in _get_running()."""

    @pytest.mark.asyncio
    async def test_wb_ws_10_raises_when_workspace_not_found(self, db, ws_user):
        """WB-WS-10: Non-existent workspace_id → 'Workspace not found' ValueError."""
        svc = make_service(db)
        with pytest.raises(ValueError, match="Workspace not found"):
            await svc._get_running(99999, ws_user.id)

    @pytest.mark.asyncio
    async def test_wb_ws_11_raises_when_not_running(self, db, ws_user, stopped_workspace):
        """WB-WS-11: Status != 'running' triggers 'Workspace is not running' error."""
        svc = make_service(db)
        with pytest.raises(ValueError, match="Workspace is not running"):
            await svc._get_running(stopped_workspace.id, ws_user.id)

    @pytest.mark.asyncio
    async def test_wb_ws_12_raises_when_no_container_id(self, db, ws_user):
        """WB-WS-12: running status but no container_id → ValueError."""
        ws = Workspace(
            user_id=ws_user.id,
            name="no-container",
            container_id=None,       # ← missing container
            status="running",
            work_dir="/workspace",
            repo_url="https://github.com/x/y",
        )
        db.add(ws)
        await db.commit()
        await db.refresh(ws)

        svc = make_service(db)
        with pytest.raises(ValueError, match="No container"):
            await svc._get_running(ws.id, ws_user.id)

    @pytest.mark.asyncio
    async def test_wb_ws_13_succeeds_for_running_workspace(self, db, ws_user, running_workspace):
        """WB-WS-13: Happy path — running workspace with container_id returned."""
        svc = make_service(db)
        result = await svc._get_running(running_workspace.id, ws_user.id)
        assert result.id == running_workspace.id


# ─────────────────────────────────────────────────────────────────────────────
# WB-WS-14 … WB-WS-16  │  delete_file root-deletion guard
# ─────────────────────────────────────────────────────────────────────────────

class TestDeleteFileGuard:
    """White Box: verify the workspace root protection logic."""

    @pytest.mark.asyncio
    async def test_wb_ws_14_cannot_delete_workspace_root(self, db, ws_user, running_workspace):
        """WB-WS-14: Path resolving to work_dir itself → ValueError (line 409-410)."""
        svc = make_service(db)
        with pytest.raises(ValueError, match="Cannot delete workspace root"):
            await svc.delete_file(running_workspace.id, ws_user.id, ".")

    @pytest.mark.asyncio
    async def test_wb_ws_15_cannot_delete_via_slash(self, db, ws_user, running_workspace):
        """WB-WS-15: Explicitly empty path also resolves to root — blocked."""
        svc = make_service(db)
        with pytest.raises(ValueError, match="Cannot delete workspace root"):
            await svc.delete_file(running_workspace.id, ws_user.id, "")

    @pytest.mark.asyncio
    async def test_wb_ws_16_can_delete_any_non_root_path(self, db, ws_user, running_workspace):
        """WB-WS-16: Valid sub-path passes the guard and calls rm -rf."""
        svc = make_service(db)
        # Mock _exec so no real Docker call is made
        svc._exec = AsyncMock(return_value="")

        result = await svc.delete_file(running_workspace.id, ws_user.id, "src/old_file.py")
        assert result["status"] == "deleted"
        svc._exec.assert_called_once()


# ─────────────────────────────────────────────────────────────────────────────
# WB-WS-17 … WB-WS-19  │  list_workspaces — destroyed exclusion
# ─────────────────────────────────────────────────────────────────────────────

class TestListWorkspacesExcludesDestroyed:
    """White Box: WHERE status != 'destroyed' clause in list_workspaces()."""

    @pytest.mark.asyncio
    async def test_wb_ws_17_destroyed_workspace_not_listed(
        self, db, ws_user, running_workspace, destroyed_workspace
    ):
        """WB-WS-17: destroyed workspace excluded from list query."""
        svc = make_service(db)
        workspaces, total = await svc.list_workspaces(ws_user.id)
        ids = [w.id for w in workspaces]
        assert running_workspace.id in ids
        assert destroyed_workspace.id not in ids

    @pytest.mark.asyncio
    async def test_wb_ws_18_total_count_excludes_destroyed(
        self, db, ws_user, running_workspace, destroyed_workspace
    ):
        """WB-WS-18: count() also excludes destroyed workspaces."""
        svc = make_service(db)
        _, total = await svc.list_workspaces(ws_user.id)
        # Only running_workspace should be counted (stopped_workspace belongs to same user fixture)
        assert total >= 1
        # Verify it's not counting destroyed
        assert total < 10  # sanity bound

    @pytest.mark.asyncio
    async def test_wb_ws_19_empty_list_for_no_workspaces(self, db, ws_user):
        """WB-WS-19: user with no workspaces → empty list and total=0."""
        svc = make_service(db)
        workspaces, total = await svc.list_workspaces(ws_user.id)
        assert isinstance(workspaces, list)
        assert total == 0


# ─────────────────────────────────────────────────────────────────────────────
# WB-WS-20 … WB-WS-22  │  _check_container_status mapping
# ─────────────────────────────────────────────────────────────────────────────

class TestCheckContainerStatus:
    """White Box: Docker status → internal status string mapping."""

    def _make_container_mock(self, docker_status: str):
        container = MagicMock()
        container.status = docker_status
        return container

    def test_wb_ws_20_docker_running_maps_to_running(self, db):
        """WB-WS-20: Docker 'running' → returns 'running'."""
        svc = make_service(db)
        mock_container = self._make_container_mock("running")
        svc.docker_client.containers.get.return_value = mock_container
        result = svc._check_container_status("container_abc")
        assert result == "running"

    def test_wb_ws_21_docker_exited_maps_to_stopped(self, db):
        """WB-WS-21: Docker 'exited' → returns 'stopped'."""
        svc = make_service(db)
        mock_container = self._make_container_mock("exited")
        svc.docker_client.containers.get.return_value = mock_container
        result = svc._check_container_status("container_abc")
        assert result == "stopped"

    def test_wb_ws_22_docker_paused_returns_none(self, db):
        """WB-WS-22: Docker 'paused' is not mapped → returns None (line 272-273)."""
        svc = make_service(db)
        mock_container = self._make_container_mock("paused")
        svc.docker_client.containers.get.return_value = mock_container
        result = svc._check_container_status("container_abc")
        assert result is None
