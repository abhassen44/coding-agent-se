"""
WHITE BOX TESTS — ExecutionService Internals
=============================================
White Box Testing: full knowledge of internal code paths in
app/services/execution_service.py.

Tests cover:
  • Language validation and mapping tables
  • Docker client availability branches
  • Container run/wait/kill lifecycle
  • Timeout detection
  • History and diagnostic DB queries
"""

import pytest
import pytest_asyncio
from datetime import datetime
from unittest.mock import MagicMock, patch, AsyncMock

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.execution_service import (
    ExecutionService,
    LANGUAGE_IMAGES,
    LANGUAGE_EXTENSIONS,
    LANGUAGE_COMMANDS,
)


# ─────────────────────────────────────────────────────────────────────────────
# WB-EX-01 … WB-EX-06  │  Language mapping tables
# ─────────────────────────────────────────────────────────────────────────────

class TestLanguageMappings:
    """White Box: language configuration dictionaries."""

    def test_wb_ex_01_all_languages_have_images(self):
        """WB-EX-01: every supported language maps to a Docker image."""
        for lang in ("python", "javascript", "cpp", "java"):
            assert lang in LANGUAGE_IMAGES, f"{lang} missing from LANGUAGE_IMAGES"

    def test_wb_ex_02_all_languages_have_extensions(self):
        """WB-EX-02: every supported language maps to a file extension."""
        for lang in LANGUAGE_IMAGES:
            assert lang in LANGUAGE_EXTENSIONS, f"{lang} missing from LANGUAGE_EXTENSIONS"
            assert LANGUAGE_EXTENSIONS[lang].startswith("."), f"{lang} extension missing dot"

    def test_wb_ex_03_all_languages_have_commands(self):
        """WB-EX-03: every supported language maps to a run command."""
        for lang in LANGUAGE_IMAGES:
            assert lang in LANGUAGE_COMMANDS, f"{lang} missing from LANGUAGE_COMMANDS"
            assert len(LANGUAGE_COMMANDS[lang]) > 0

    def test_wb_ex_04_java_file_is_Main(self):
        """WB-EX-04: Java command includes 'Main' class reference."""
        assert "Main" in LANGUAGE_COMMANDS["java"]

    def test_wb_ex_05_supported_languages_list(self):
        """WB-EX-05: _get_supported_languages returns correct list."""
        db = MagicMock(spec=AsyncSession)
        with patch("docker.from_env", return_value=MagicMock()):
            svc = ExecutionService(db)
        result = svc._get_supported_languages()
        assert set(result) == {"python", "javascript", "cpp", "java"}

    def test_wb_ex_06_python_image_is_slim(self):
        """WB-EX-06: Python uses a slim image to minimise attack surface."""
        assert "slim" in LANGUAGE_IMAGES["python"]


# ─────────────────────────────────────────────────────────────────────────────
# WB-EX-07 … WB-EX-10  │  Docker client initialisation
# ─────────────────────────────────────────────────────────────────────────────

class TestDockerInit:
    """White Box: Docker client creation branches."""

    def test_wb_ex_07_docker_available(self):
        """WB-EX-07: when Docker is available, client is set."""
        mock_client = MagicMock()
        db = MagicMock(spec=AsyncSession)
        with patch("docker.from_env", return_value=mock_client):
            svc = ExecutionService(db)
        assert svc.docker_client is mock_client

    def test_wb_ex_08_docker_unavailable_sets_none(self):
        """WB-EX-08: when docker.from_env() raises, client is None."""
        db = MagicMock(spec=AsyncSession)
        with patch("docker.from_env", side_effect=Exception("Docker not running")):
            svc = ExecutionService(db)
        assert svc.docker_client is None


# ─────────────────────────────────────────────────────────────────────────────
# WB-EX-11 … WB-EX-16  │  execute_code branches
# ─────────────────────────────────────────────────────────────────────────────

class TestExecuteCodeBranches:
    """White Box: execute_code internal control flow."""

    @pytest.mark.asyncio
    async def test_wb_ex_09_unsupported_language_returns_error(self, db):
        """WB-EX-09: unsupported language triggers early error without Docker."""
        with patch("docker.from_env", return_value=MagicMock()):
            svc = ExecutionService(db)
        result = await svc.execute_code(
            user_id=1, code="print('hi')", language="rust"
        )
        assert result.status == "error"
        assert "Unsupported language" in result.stderr
        assert result.exit_code == -1

    @pytest.mark.asyncio
    async def test_wb_ex_10_docker_none_returns_error(self, db):
        """WB-EX-10: Docker unavailable produces a descriptive error."""
        with patch("docker.from_env", side_effect=Exception("nope")):
            svc = ExecutionService(db)
        result = await svc.execute_code(
            user_id=1, code="print('hi')", language="python"
        )
        assert result.status == "error"
        assert "Docker is not available" in result.stderr

    @pytest.mark.asyncio
    async def test_wb_ex_11_language_normalised_to_lowercase(self, db):
        """WB-EX-11: mixed-case language is lowered before lookup."""
        with patch("docker.from_env", side_effect=Exception("nope")):
            svc = ExecutionService(db)
        result = await svc.execute_code(
            user_id=1, code="x=1", language="  Python  "
        )
        # Should reach the Docker-unavailable branch, not the unsupported branch
        assert "Docker is not available" in result.stderr


# ─────────────────────────────────────────────────────────────────────────────
# WB-EX-12 … WB-EX-18  │  _run_in_container branches
# ─────────────────────────────────────────────────────────────────────────────

class TestRunInContainer:
    """White Box: synchronous _run_in_container method."""

    def _make_svc(self):
        db = MagicMock(spec=AsyncSession)
        mock_docker = MagicMock()
        with patch("docker.from_env", return_value=mock_docker):
            svc = ExecutionService(db)
        return svc, mock_docker

    def test_wb_ex_12_success_path(self):
        """WB-EX-12: container runs successfully → status 'success'."""
        svc, docker = self._make_svc()
        mock_container = MagicMock()
        mock_container.wait.return_value = {"StatusCode": 0}
        mock_container.logs.side_effect = [b"Hello\n", b""]
        docker.containers.run.return_value = mock_container
        docker.images.get.return_value = MagicMock()

        result = svc._run_in_container("print('Hello')", "python", None, 10)
        assert result["status"] == "success"
        assert result["exit_code"] == 0
        assert "Hello" in result["stdout"]

    def test_wb_ex_13_error_exit_code(self):
        """WB-EX-13: non-zero exit → status 'error'."""
        svc, docker = self._make_svc()
        mock_container = MagicMock()
        mock_container.wait.return_value = {"StatusCode": 1}
        mock_container.logs.side_effect = [b"", b"NameError\n"]
        docker.containers.run.return_value = mock_container
        docker.images.get.return_value = MagicMock()

        result = svc._run_in_container("print(x)", "python", None, 10)
        assert result["status"] == "error"
        assert result["exit_code"] == 1

    def test_wb_ex_14_timeout_detected(self):
        """WB-EX-14: container.wait() raises timeout → status 'timeout'."""
        svc, docker = self._make_svc()
        mock_container = MagicMock()
        mock_container.wait.side_effect = Exception("timed out waiting")
        mock_container.kill.return_value = None
        docker.containers.run.return_value = mock_container
        docker.images.get.return_value = MagicMock()

        result = svc._run_in_container("while True: pass", "python", None, 1)
        assert result["status"] == "timeout"
        assert result["exit_code"] == -1
        mock_container.kill.assert_called_once()

    def test_wb_ex_15_image_not_found_pulls(self):
        """WB-EX-15: ImageNotFound on get → pulls the image."""
        from docker.errors import ImageNotFound
        svc, docker = self._make_svc()
        docker.images.get.side_effect = ImageNotFound("not found")
        mock_container = MagicMock()
        mock_container.wait.return_value = {"StatusCode": 0}
        mock_container.logs.side_effect = [b"ok\n", b""]
        docker.containers.run.return_value = mock_container

        result = svc._run_in_container("print('ok')", "python", None, 10)
        docker.images.pull.assert_called_once_with("python:3.12-slim")
        assert result["status"] == "success"

    def test_wb_ex_16_image_pull_fails(self):
        """WB-EX-16: image pull also fails → error with descriptive message."""
        from docker.errors import ImageNotFound
        svc, docker = self._make_svc()
        docker.images.get.side_effect = ImageNotFound("nope")
        docker.images.pull.side_effect = ImageNotFound("Cannot pull")
        docker.containers.run.side_effect = ImageNotFound("Cannot pull")

        result = svc._run_in_container("x", "python", None, 10)
        assert result["status"] == "error"
        assert "not found" in result["stderr"].lower()

    def test_wb_ex_17_api_error(self):
        """WB-EX-17: Docker APIError → error status."""
        from docker.errors import APIError
        svc, docker = self._make_svc()
        docker.images.get.return_value = MagicMock()
        docker.containers.run.side_effect = APIError("daemon error")

        result = svc._run_in_container("x", "python", None, 10)
        assert result["status"] == "error"
        assert "Docker API error" in result["stderr"]

    def test_wb_ex_18_stdin_creates_file_and_pipes(self):
        """WB-EX-18: when stdin is provided, command is modified to pipe it."""
        svc, docker = self._make_svc()
        mock_container = MagicMock()
        mock_container.wait.return_value = {"StatusCode": 0}
        mock_container.logs.side_effect = [b"input_data\n", b""]
        docker.containers.run.return_value = mock_container
        docker.images.get.return_value = MagicMock()

        result = svc._run_in_container("x = input()", "python", "hello", 10)
        # Verify stdin was piped — the command arg to containers.run should include stdin.txt
        call_args = docker.containers.run.call_args
        cmd_used = call_args[1].get("command", call_args[0][1] if len(call_args[0]) > 1 else "")
        assert "stdin.txt" in str(cmd_used)
        assert result["status"] == "success"

    def test_wb_ex_19_container_removed_on_success(self):
        """WB-EX-19: container.remove(force=True) is called after success."""
        svc, docker = self._make_svc()
        mock_container = MagicMock()
        mock_container.wait.return_value = {"StatusCode": 0}
        mock_container.logs.side_effect = [b"ok\n", b""]
        docker.containers.run.return_value = mock_container
        docker.images.get.return_value = MagicMock()

        svc._run_in_container("print('ok')", "python", None, 10)
        mock_container.remove.assert_called_once_with(force=True)


# ─────────────────────────────────────────────────────────────────────────────
# WB-EX-20 … WB-EX-23  │  DB query methods
# ─────────────────────────────────────────────────────────────────────────────

class TestDBQueries:
    """White Box: get_execution, get_history, save_diagnostic."""

    @pytest.mark.asyncio
    async def test_wb_ex_20_get_execution_returns_match(self, db):
        """WB-EX-20: get_execution returns an owned execution."""
        from app.models.execution import Execution
        exec_record = Execution(
            user_id=1, language="python", code="print(1)",
            status="success", exit_code=0, execution_time_ms=50,
        )
        db.add(exec_record)
        await db.commit()
        await db.refresh(exec_record)

        with patch("docker.from_env", return_value=MagicMock()):
            svc = ExecutionService(db)
        result = await svc.get_execution(exec_record.id, user_id=1)
        assert result is not None
        assert result.id == exec_record.id

    @pytest.mark.asyncio
    async def test_wb_ex_21_get_execution_wrong_user_returns_none(self, db):
        """WB-EX-21: mismatched user_id means no result."""
        from app.models.execution import Execution
        exec_record = Execution(
            user_id=1, language="python", code="print(1)",
            status="success", exit_code=0, execution_time_ms=50,
        )
        db.add(exec_record)
        await db.commit()
        await db.refresh(exec_record)

        with patch("docker.from_env", return_value=MagicMock()):
            svc = ExecutionService(db)
        result = await svc.get_execution(exec_record.id, user_id=999)
        assert result is None

    @pytest.mark.asyncio
    async def test_wb_ex_22_get_history_returns_paginated(self, db):
        """WB-EX-22: get_history returns executions with correct total."""
        from app.models.execution import Execution
        for i in range(5):
            db.add(Execution(
                user_id=1, language="python", code=f"print({i})",
                status="success", exit_code=0, execution_time_ms=10,
            ))
        await db.commit()

        with patch("docker.from_env", return_value=MagicMock()):
            svc = ExecutionService(db)
        executions, total = await svc.get_history(user_id=1, limit=3, offset=0)
        assert total == 5
        assert len(executions) == 3

    @pytest.mark.asyncio
    async def test_wb_ex_23_save_diagnostic_updates_record(self, db):
        """WB-EX-23: save_diagnostic writes to the execution row."""
        from app.models.execution import Execution
        exec_record = Execution(
            user_id=1, language="python", code="print(x)",
            status="error", exit_code=1, execution_time_ms=50,
            stderr="NameError: name 'x' is not defined",
        )
        db.add(exec_record)
        await db.commit()
        await db.refresh(exec_record)

        with patch("docker.from_env", return_value=MagicMock()):
            svc = ExecutionService(db)
        await svc.save_diagnostic(exec_record.id, "Variable 'x' is not defined.")
        await db.refresh(exec_record)
        assert exec_record.error_diagnostic == "Variable 'x' is not defined."
