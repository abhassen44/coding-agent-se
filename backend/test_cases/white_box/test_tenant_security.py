"""Regression tests for tenant isolation and the multi-user security fixes."""
import pytest
from unittest.mock import MagicMock, patch

from app.core.rate_limit import get_rule
from app.core.security import create_access_token, create_ws_ticket, decode_ws_ticket
from app.models.conversation import Conversation, ChatMessageRecord
from app.models.execution import Execution
from app.models.file import File, FileChunk, Repository
from app.models.user import User, UserRole
from app.models.workspace import Workspace
from app.services.conversation_service import ConversationService
from app.services.file_service import FileService
from app.services.rag_service import RAGService
from app.services.workspace_service import WorkspaceService
from unittest.mock import AsyncMock


@pytest.mark.asyncio
async def test_chat_requires_authentication(client):
    response = await client.post("/api/v1/chat/message", json={"message": "hello"})
    assert response.status_code in (401, 403)


@pytest.mark.asyncio
async def test_chat_rejects_another_users_conversation(client, db, test_user, auth_token):
    other = User(
        email="other-chat@example.com",
        password_hash="x",
        role=UserRole.USER.value,
        is_active=True,
    )
    db.add(other)
    await db.commit()
    await db.refresh(other)
    conv = Conversation(user_id=other.id, title="private")
    db.add(conv)
    await db.commit()
    await db.refresh(conv)

    response = await client.post(
        "/api/v1/chat/message",
        headers={"Authorization": f"Bearer {auth_token}"},
        json={"message": "hello", "conversation_id": conv.id},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_chat_rejects_another_users_repository(client, db, test_user, auth_token):
    other = User(
        email="other-repo@example.com",
        password_hash="x",
        role=UserRole.USER.value,
        is_active=True,
    )
    db.add(other)
    await db.commit()
    await db.refresh(other)
    repo = Repository(name="private", owner_id=other.id, url="https://github.com/x/y")
    db.add(repo)
    await db.commit()
    await db.refresh(repo)

    response = await client.post(
        "/api/v1/chat/message",
        headers={"Authorization": f"Bearer {auth_token}"},
        json={"message": "hello", "repository_id": repo.id},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_conversation_service_enforces_owner(db, test_user):
    other = User(
        email="other-conv@example.com",
        password_hash="x",
        role=UserRole.USER.value,
        is_active=True,
    )
    db.add(other)
    await db.commit()
    await db.refresh(other)
    conv = Conversation(user_id=other.id, title="private")
    db.add(conv)
    await db.commit()
    await db.refresh(conv)

    service = ConversationService(db)
    assert await service.get_for_user(conv.id, test_user.id) is None
    assert await service.get_for_user(conv.id, other.id) is not None


def test_file_service_sanitizes_traversal(tmp_path):
    service = FileService.__new__(FileService)
    service.storage_base = tmp_path

    sanitized = service.sanitize_filename("../../etc/passwd")
    path = service._get_storage_path(1, "../../etc/passwd", "abcdef")

    assert sanitized == "passwd"
    assert path.parent == tmp_path / "1" / "ab"
    assert path.name == "abcdef_passwd"


@pytest.mark.asyncio
async def test_upload_rejects_foreign_repository(db, test_user, tmp_path):
    other = User(
        email="other-file@example.com",
        password_hash="x",
        role=UserRole.USER.value,
        is_active=True,
    )
    db.add(other)
    await db.commit()
    await db.refresh(other)
    repo = Repository(name="private", owner_id=other.id, url="https://github.com/x/y")
    db.add(repo)
    await db.commit()
    await db.refresh(repo)

    service = FileService(db)
    service.storage_base = tmp_path
    with pytest.raises(ValueError, match="Repository not found"):
        await service.upload_file(
            b"secret",
            "note.txt",
            owner_id=test_user.id,
            repository_id=repo.id,
        )


@pytest.mark.asyncio
async def test_keyword_search_is_owner_scoped(db, test_user):
    other = User(
        email="other-rag@example.com",
        password_hash="x",
        role=UserRole.USER.value,
        is_active=True,
    )
    db.add(other)
    await db.commit()
    await db.refresh(other)

    for owner, name in ((test_user.id, "mine.py"), (other.id, "theirs.py")):
        f = File(
            name=name,
            path=name,
            size=10,
            owner_id=owner,
            storage_path=f"/tmp/{name}",
        )
        db.add(f)
        await db.flush()
        db.add(
            FileChunk(
                file_id=f.id,
                content="needle in the haystack",
                start_line=1,
                end_line=1,
            )
        )
    await db.commit()

    results = await RAGService(db)._keyword_search(
        "needle", 5, repository_id=None, owner_id=test_user.id
    )
    assert len(results) == 1
    assert results[0].file_name == "mine.py"


@pytest.mark.asyncio
async def test_workspace_quota_and_name_sanitization(db, test_user, test_workspace):
    service = WorkspaceService(db)
    service.docker_client = MagicMock()
    service.docker_client.containers.list.return_value = [1]

    with pytest.raises(ValueError, match="limit"):
        await service.create_workspace(
            user_id=test_user.id,
            repo_url="https://github.com/example/other",
        )

    assert WorkspaceService._safe_docker_name("my repo") == "my-repo"
    assert WorkspaceService._safe_docker_name("my repo/../../x") == "my-repo-..-..-x"
    assert all(c.isalnum() or c in "._-" for c in WorkspaceService._safe_docker_name("a b/c"))


@pytest.mark.asyncio
async def test_admin_stats_uses_workspace_name_filter(db):
    from app.services.admin_service import AdminService

    with patch("app.services.admin_service.docker.from_env") as factory:
        client = factory.return_value
        client.containers.list.return_value = [1, 2]
        stats = await AdminService(db).get_stats()

    assert stats.active_containers == 2
    assert client.containers.list.call_args.kwargs["filters"]["name"] == "ica_ws_"


def test_rate_limit_rules_cover_expensive_routes():
    assert get_rule("/api/v1/chat/message") == (30, 60)
    assert get_rule("/api/v1/repo/import") == (3, 3600)
    assert get_rule("/api/v1/repo/42/reindex") == (3, 3600)
    assert get_rule("/api/v1/files/upload") == (20, 3600)
    assert get_rule("/api/v1/workspace/create") == (6, 3600)


def test_ws_ticket_is_scoped_and_rejects_access_tokens():
    ticket = create_ws_ticket(7, workspace_id=12)
    payload = decode_ws_ticket(ticket)
    assert payload is not None
    assert payload["type"] == "ws"
    assert payload["workspace_id"] == 12
    assert decode_ws_ticket(create_access_token(7)) is None


@pytest.mark.asyncio
async def test_admin_delete_cleans_owned_rows_and_files(db, tmp_path):
    from sqlalchemy import func, select
    from app.services.admin_service import AdminService

    user = User(
        email="delete-me@example.com",
        password_hash="x",
        role=UserRole.USER.value,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    workspace = Workspace(
        user_id=user.id,
        name="delete-ws",
        container_id="container",
        volume_name="volume",
        status="running",
        base_image="node:20-bookworm",
        work_dir="/workspace",
    )
    repo = Repository(name="repo", owner_id=user.id, url="https://github.com/x/y")
    db.add_all([workspace, repo])
    await db.flush()

    stored = tmp_path / "uploaded.txt"
    stored.write_text("data")
    file = File(
        name="uploaded.txt",
        path="uploaded.txt",
        size=4,
        owner_id=user.id,
        repository_id=repo.id,
        storage_path=str(stored),
    )
    db.add(file)
    await db.flush()
    db.add(FileChunk(file_id=file.id, content="data", start_line=1, end_line=1))

    conv = Conversation(user_id=user.id, title="chat")
    db.add(conv)
    await db.flush()
    db.add(ChatMessageRecord(conversation_id=conv.id, role="user", content="hi"))
    db.add(Execution(user_id=user.id, language="python", code="print(1)", status="success"))
    await db.commit()

    with patch.object(WorkspaceService, "destroy_workspace", new=AsyncMock()), \
         patch.object(RAGService, "__init__", return_value=None), \
         patch.object(RAGService, "delete_repository_vectors", new=AsyncMock()), \
         patch.object(RAGService, "delete_file_vectors", new=AsyncMock()), \
         patch.object(RAGService, "delete_owner_vectors", new=AsyncMock()):
        await AdminService(db)._inline_delete_user(user.id)

    async def count(model):
        return await db.scalar(select(func.count()).select_from(model))

    assert not stored.exists()
    assert await count(User) == 0
    assert await count(Workspace) == 0
    assert await count(Repository) == 0
    assert await count(File) == 0
    assert await count(FileChunk) == 0
    assert await count(Conversation) == 0
    assert await count(ChatMessageRecord) == 0
    assert await count(Execution) == 0
