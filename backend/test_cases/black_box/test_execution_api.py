"""
BLACK BOX TESTS — /api/v1/execute  (Code Execution API)
========================================================
Black Box Testing: tests interact with the execution HTTP API as an
external user would — no knowledge of Docker internals or DB schema.

API Surface under test:
  POST   /api/v1/execute/run               → 200 ExecuteResponse
  GET    /api/v1/execute/history            → 200 ExecutionHistoryResponse
  GET    /api/v1/execute/{id}               → 200 ExecuteResponse | 404
  POST   /api/v1/execute/{id}/diagnose      → 200 DiagnosticResponse | 400/404

All tests that touch Docker are mocked at the service level so they
can run in CI without a real daemon.
"""

import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient

from app.services.execution_service import ExecutionService
from app.models.execution import Execution

BASE = "/api/v1/execute"
AUTH_BASE = "/api/v1/auth"


def _make_execution(**kwargs) -> MagicMock:
    """Build a MagicMock that quacks like an Execution ORM instance."""
    defaults = dict(
        id=1,
        user_id=1,
        language="python",
        code="print('hello')",
        stdin=None,
        stdout="hello\n",
        stderr="",
        status="success",
        exit_code=0,
        execution_time_ms=42,
        memory_used_kb=None,
        error_diagnostic=None,
        created_at=datetime(2025, 1, 1, 0, 0, 0),
        completed_at=datetime(2025, 1, 1, 0, 0, 1),
    )
    defaults.update(kwargs)
    mock_exec = MagicMock(spec=Execution)
    for k, v in defaults.items():
        setattr(mock_exec, k, v)
    return mock_exec


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

async def register_and_login(client: AsyncClient, email: str, password: str = "Pass123!") -> str:
    """Register a user and return bearer access token."""
    await client.post(f"{AUTH_BASE}/register", json={
        "email": email, "password": password, "full_name": "Exec Test"
    })
    resp = await client.post(f"{AUTH_BASE}/login", json={"email": email, "password": password})
    return resp.json()["access_token"]


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ─────────────────────────────────────────────────────────────────────────────
# BB-EX-01 … BB-EX-06  │  POST /run
# ─────────────────────────────────────────────────────────────────────────────

class TestExecuteRun:
    """Black Box: code execution endpoint."""

    @pytest.mark.asyncio
    async def test_bb_ex_01_run_python_returns_200(self, client: AsyncClient):
        """BB-EX-01: valid python execution → 200 with output."""
        token = await register_and_login(client, "exec_run@test.com")
        fake_exec = _make_execution()
        with patch.object(ExecutionService, "execute_code", new=AsyncMock(return_value=fake_exec)):
            resp = await client.post(f"{BASE}/run", json={
                "code": "print('hello')",
                "language": "python",
            }, headers=auth_header(token))
        assert resp.status_code == 200
        body = resp.json()
        assert "id" in body
        assert "status" in body
        assert "language" in body

    @pytest.mark.asyncio
    async def test_bb_ex_02_run_requires_auth(self, client: AsyncClient):
        """BB-EX-02: unauthenticated request → 401 or 403."""
        resp = await client.post(f"{BASE}/run", json={
            "code": "print(1)", "language": "python"
        })
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_bb_ex_03_run_missing_code_returns_422(self, client: AsyncClient):
        """BB-EX-03: missing required 'code' field → 422."""
        token = await register_and_login(client, "exec_nocode@test.com")
        resp = await client.post(f"{BASE}/run", json={
            "language": "python"
        }, headers=auth_header(token))
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_bb_ex_04_run_missing_language_returns_422(self, client: AsyncClient):
        """BB-EX-04: missing required 'language' field → 422."""
        token = await register_and_login(client, "exec_nolang@test.com")
        resp = await client.post(f"{BASE}/run", json={
            "code": "x = 1"
        }, headers=auth_header(token))
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_bb_ex_05_run_with_stdin_accepted(self, client: AsyncClient):
        """BB-EX-05: optional stdin field is accepted."""
        token = await register_and_login(client, "exec_stdin@test.com")
        fake_exec = _make_execution(stdin="42")
        with patch.object(ExecutionService, "execute_code", new=AsyncMock(return_value=fake_exec)):
            resp = await client.post(f"{BASE}/run", json={
                "code": "x = input()", "language": "python", "stdin": "42"
            }, headers=auth_header(token))
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_bb_ex_06_run_timeout_over_30_returns_422(self, client: AsyncClient):
        """BB-EX-06: timeout > 30 violates schema constraint → 422."""
        token = await register_and_login(client, "exec_timeout@test.com")
        resp = await client.post(f"{BASE}/run", json={
            "code": "x = 1", "language": "python", "timeout": 60
        }, headers=auth_header(token))
        assert resp.status_code == 422


# ─────────────────────────────────────────────────────────────────────────────
# BB-EX-07 … BB-EX-10  │  GET /history
# ─────────────────────────────────────────────────────────────────────────────

class TestExecutionHistory:
    """Black Box: execution history endpoint."""

    @pytest.mark.asyncio
    async def test_bb_ex_07_history_returns_200(self, client: AsyncClient):
        """BB-EX-07: authenticated history request → 200."""
        token = await register_and_login(client, "exec_hist@test.com")
        with patch.object(ExecutionService, "get_history", new=AsyncMock(return_value=([], 0))):
            resp = await client.get(f"{BASE}/history", headers=auth_header(token))
        assert resp.status_code == 200
        body = resp.json()
        assert "executions" in body
        assert "total" in body

    @pytest.mark.asyncio
    async def test_bb_ex_08_history_unauthenticated_returns_401(self, client: AsyncClient):
        """BB-EX-08: no auth header → 401 or 403."""
        resp = await client.get(f"{BASE}/history")
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_bb_ex_09_history_accepts_limit_offset(self, client: AsyncClient):
        """BB-EX-09: pagination query params accepted."""
        token = await register_and_login(client, "exec_page@test.com")
        with patch.object(ExecutionService, "get_history", new=AsyncMock(return_value=([], 0))):
            resp = await client.get(
                f"{BASE}/history?limit=5&offset=10",
                headers=auth_header(token)
            )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_bb_ex_10_history_limit_over_100_returns_422(self, client: AsyncClient):
        """BB-EX-10: limit > 100 violates constraint → 422."""
        token = await register_and_login(client, "exec_biglimit@test.com")
        resp = await client.get(f"{BASE}/history?limit=200", headers=auth_header(token))
        assert resp.status_code == 422


# ─────────────────────────────────────────────────────────────────────────────
# BB-EX-11 … BB-EX-13  │  GET /{id}
# ─────────────────────────────────────────────────────────────────────────────

class TestGetExecution:
    """Black Box: get single execution endpoint."""

    @pytest.mark.asyncio
    async def test_bb_ex_11_get_existing_execution(self, client: AsyncClient):
        """BB-EX-11: valid execution ID → 200 with body."""
        token = await register_and_login(client, "exec_get@test.com")
        fake_exec = _make_execution(id=42)
        with patch.object(ExecutionService, "get_execution", new=AsyncMock(return_value=fake_exec)):
            resp = await client.get(f"{BASE}/42", headers=auth_header(token))
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == 42

    @pytest.mark.asyncio
    async def test_bb_ex_12_get_nonexistent_returns_404(self, client: AsyncClient):
        """BB-EX-12: execution not found → 404."""
        token = await register_and_login(client, "exec_notfound@test.com")
        with patch.object(ExecutionService, "get_execution", new=AsyncMock(return_value=None)):
            resp = await client.get(f"{BASE}/99999", headers=auth_header(token))
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_bb_ex_13_get_unauthenticated_returns_401(self, client: AsyncClient):
        """BB-EX-13: no auth header → 401 or 403."""
        resp = await client.get(f"{BASE}/1")
        assert resp.status_code in (401, 403)


# ─────────────────────────────────────────────────────────────────────────────
# BB-EX-14 … BB-EX-18  │  POST /{id}/diagnose
# ─────────────────────────────────────────────────────────────────────────────

class TestDiagnoseExecution:
    """Black Box: AI diagnostic endpoint."""

    @pytest.mark.asyncio
    async def test_bb_ex_14_diagnose_failed_execution(self, client: AsyncClient):
        """BB-EX-14: diagnose a failed execution → 200 with diagnostic."""
        token = await register_and_login(client, "exec_diag@test.com")
        fake_exec = _make_execution(
            id=10, status="error", exit_code=1,
            stderr="NameError: name 'x' is not defined",
        )
        with patch.object(ExecutionService, "get_execution", new=AsyncMock(return_value=fake_exec)):
            with patch("app.api.execution.get_gemini_service") as mock_gemini:
                mock_svc = MagicMock()
                mock_svc.diagnose_execution_error = AsyncMock(
                    return_value="Variable 'x' is not defined."
                )
                mock_gemini.return_value = mock_svc
                with patch.object(ExecutionService, "save_diagnostic", new=AsyncMock()):
                    resp = await client.post(
                        f"{BASE}/10/diagnose",
                        headers=auth_header(token)
                    )
        assert resp.status_code == 200
        body = resp.json()
        assert "diagnostic" in body
        assert body["execution_id"] == 10

    @pytest.mark.asyncio
    async def test_bb_ex_15_diagnose_success_execution_returns_400(self, client: AsyncClient):
        """BB-EX-15: diagnosing a successful execution → 400."""
        token = await register_and_login(client, "exec_diagok@test.com")
        fake_exec = _make_execution(id=10, status="success")
        with patch.object(ExecutionService, "get_execution", new=AsyncMock(return_value=fake_exec)):
            resp = await client.post(f"{BASE}/10/diagnose", headers=auth_header(token))
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_bb_ex_16_diagnose_nonexistent_returns_404(self, client: AsyncClient):
        """BB-EX-16: execution not found → 404."""
        token = await register_and_login(client, "exec_diagnf@test.com")
        with patch.object(ExecutionService, "get_execution", new=AsyncMock(return_value=None)):
            resp = await client.post(f"{BASE}/99999/diagnose", headers=auth_header(token))
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_bb_ex_17_diagnose_unauthenticated_returns_401(self, client: AsyncClient):
        """BB-EX-17: no auth → 401 or 403."""
        resp = await client.post(f"{BASE}/1/diagnose")
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_bb_ex_18_diagnose_timeout_execution_allowed(self, client: AsyncClient):
        """BB-EX-18: timed-out execution should also be diagnosable."""
        token = await register_and_login(client, "exec_diagto@test.com")
        fake_exec = _make_execution(
            id=11, status="timeout", exit_code=-1,
            stderr="Execution timed out after 10 seconds.",
        )
        with patch.object(ExecutionService, "get_execution", new=AsyncMock(return_value=fake_exec)):
            with patch("app.api.execution.get_gemini_service") as mock_gemini:
                mock_svc = MagicMock()
                mock_svc.diagnose_execution_error = AsyncMock(
                    return_value="Infinite loop detected."
                )
                mock_gemini.return_value = mock_svc
                with patch.object(ExecutionService, "save_diagnostic", new=AsyncMock()):
                    resp = await client.post(
                        f"{BASE}/11/diagnose",
                        headers=auth_header(token)
                    )
        assert resp.status_code == 200
        body = resp.json()
        assert "diagnostic" in body
