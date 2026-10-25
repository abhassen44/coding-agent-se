"""Regression tests for agent workspace tool command construction."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.agent_service import create_workspace_tools


def _tools(workspace_service):
    return {
        tool.name: tool
        for tool in create_workspace_tools(workspace_service, 1, 1)
    }


def _service():
    service = MagicMock()
    service.get_workspace = AsyncMock(
        return_value=SimpleNamespace(container_id="container_abc")
    )
    service.read_file = AsyncMock(return_value={"content": "abc"})
    service.write_file = AsyncMock()
    return service


@pytest.mark.asyncio
async def test_append_to_file_adds_real_newline():
    service = _service()
    tool = _tools(service)["append_to_file"]

    result = await tool.ainvoke({"path": "notes.txt", "content": "next"})

    assert "Successfully appended" in result
    service.write_file.assert_awaited_once_with(1, 1, "notes.txt", "abc\nnext")


@pytest.mark.asyncio
async def test_append_to_file_does_not_duplicate_newline():
    service = _service()
    service.read_file = AsyncMock(return_value={"content": "abc\n"})
    tool = _tools(service)["append_to_file"]

    await tool.ainvoke({"path": "notes.txt", "content": "next"})

    service.write_file.assert_awaited_once_with(1, 1, "notes.txt", "abc\nnext")


@pytest.mark.asyncio
async def test_search_code_uses_match_cap_and_quotes_pattern(monkeypatch):
    service = _service()
    tool = _tools(service)["search_code"]

    captured = {}

    class FakeProc:
        returncode = 0

        async def communicate(self):
            return b"src/a.py:1:def main():", b""

    async def fake_exec(*args, **kwargs):
        captured["args"] = args
        return FakeProc()

    monkeypatch.setattr("app.services.agent_service.asyncio.create_subprocess_exec", fake_exec)

    result = await tool.ainvoke({"pattern": "def main", "path": "src"})

    command = captured["args"][5]
    assert "-m 50" in command
    assert "-l 50" not in command
    assert "'def main'" in command
    assert "src/a.py" in result


@pytest.mark.asyncio
async def test_move_file_quotes_paths_with_spaces(monkeypatch):
    service = _service()
    tool = _tools(service)["move_file"]

    captured = {}

    class FakeProc:
        returncode = 0

        async def communicate(self):
            return b"", b""

    async def fake_exec(*args, **kwargs):
        captured["args"] = args
        return FakeProc()

    monkeypatch.setattr("app.services.agent_service.asyncio.create_subprocess_exec", fake_exec)

    await tool.ainvoke({"from_path": "my file.txt", "to_path": "new name.txt"})

    command = captured["args"][5]
    assert "'/workspace/my file.txt'" in command
    assert "'/workspace/new name.txt'" in command
