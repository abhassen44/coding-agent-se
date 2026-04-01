"""
Shared test configuration and fixtures.

Provides:
  - In-memory SQLite async DB session
  - FastAPI TestClient / async HTTP client
  - Pre-built model factories (User, Workspace)
  - Mock objects for Docker client and security layer
"""

import pytest
import pytest_asyncio
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import StaticPool
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.core.database import Base, get_db
from app.core.security import get_password_hash, create_access_token
from app.models.user import User, UserRole
from app.models.workspace import Workspace


# ── Database ──────────────────────────────────────────────────────────────────

DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture(scope="function")
async def engine():
    """Create a fresh in-memory SQLite engine per test."""
    _engine = create_async_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield _engine
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await _engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def db(engine):
    """Provide an async DB session, rolling back after each test."""
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session
        await session.rollback()


# ── Factories ─────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def test_user(db: AsyncSession) -> User:
    """Create and persist a test user."""
    user = User(
        email="testuser@example.com",
        password_hash=get_password_hash("SecurePass123!"),
        full_name="Test User",
        role=UserRole.USER.value,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def admin_user(db: AsyncSession) -> User:
    """Create and persist an admin user."""
    user = User(
        email="admin@example.com",
        password_hash=get_password_hash("AdminPass123!"),
        full_name="Admin User",
        role=UserRole.ADMIN.value,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def inactive_user(db: AsyncSession) -> User:
    """Create and persist an inactive user."""
    user = User(
        email="inactive@example.com",
        password_hash=get_password_hash("SomePass123!"),
        full_name="Inactive User",
        role=UserRole.USER.value,
        is_active=False,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def test_workspace(db: AsyncSession, test_user: User) -> Workspace:
    """Create and persist a test workspace in 'running' status."""
    ws = Workspace(
        user_id=test_user.id,
        name="test-repo",
        container_id="abc123containerid",
        volume_name="ica_ws_1_test-repo_000000",
        status="running",
        base_image="node:20-bookworm",
        work_dir="/workspace",
        repo_url="https://github.com/example/test-repo",
    )
    db.add(ws)
    await db.commit()
    await db.refresh(ws)
    return ws


# ── Tokens ────────────────────────────────────────────────────────────────────

@pytest.fixture
def auth_token(test_user: User) -> str:
    return create_access_token(subject=test_user.id, additional_claims={"role": test_user.role})


@pytest.fixture
def admin_token(admin_user: User) -> str:
    return create_access_token(subject=admin_user.id, additional_claims={"role": admin_user.role})


@pytest.fixture
def expired_token() -> str:
    return create_access_token(subject=999, expires_delta=timedelta(seconds=-1))


# ── HTTP Client ───────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def client(db: AsyncSession):
    """Async HTTP client with DB dependency override."""
    async def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


# ── Docker Mock ───────────────────────────────────────────────────────────────

@pytest.fixture
def mock_docker():
    """Mock the docker.from_env() so no real Docker daemon is needed."""
    with patch("docker.from_env") as mock_factory:
        mock_client = MagicMock()
        mock_factory.return_value = mock_client
        yield mock_client
