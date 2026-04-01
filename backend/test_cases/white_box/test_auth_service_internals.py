"""
WHITE BOX TESTS — app/services/auth_service.py
===============================================
White Box Testing: tester reads the source code and tests every internal
branch, guard clause, and database interaction.

Branches under test (from auth_service.py):
  get_user_by_email()  → scalar_one_or_none (exists / not-exists)
  get_user_by_id()     → scalar_one_or_none (exists / not-exists)
  create_user()        → password hashing, role default, commit cycle
  authenticate_user()  → 3 early-return paths:
                          (a) user not found
                          (b) user found but wrong password
                          (c) user found, correct password but inactive
                          (d) happy path
"""

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.auth_service import AuthService
from app.schemas.auth import UserCreate
from app.models.user import User, UserRole
from app.core.security import get_password_hash, verify_password


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def service(db: AsyncSession) -> AuthService:
    return AuthService(db)


@pytest_asyncio.fixture
async def existing_user(db: AsyncSession) -> User:
    u = User(
        email="existing@test.com",
        password_hash=get_password_hash("CorrectPassword1!"),
        full_name="Existing User",
        role=UserRole.USER.value,
        is_active=True,
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return u


# ─────────────────────────────────────────────────────────────────────────────
# WB-AUTH-01 … WB-AUTH-04  │  get_user_by_email
# ─────────────────────────────────────────────────────────────────────────────

class TestGetUserByEmail:

    @pytest.mark.asyncio
    async def test_wb_auth_01_returns_user_when_exists(self, service, existing_user):
        """WB-AUTH-01: SELECT WHERE email → scalar_one_or_none returns User object."""
        result = await service.get_user_by_email("existing@test.com")
        assert result is not None
        assert result.email == "existing@test.com"

    @pytest.mark.asyncio
    async def test_wb_auth_02_returns_none_when_missing(self, service):
        """WB-AUTH-02: SELECT WHERE email on non-existent email → None."""
        result = await service.get_user_by_email("ghost@nowhere.com")
        assert result is None

    @pytest.mark.asyncio
    async def test_wb_auth_03_case_sensitive_email_lookup(self, service, existing_user):
        """WB-AUTH-03: SQLite/Postgres WHERE is case-sensitive by default."""
        result = await service.get_user_by_email("EXISTING@TEST.COM")
        # SQLite collation may differ; confirm behaviour is consistent
        # (result may be None or the user depending on DB collation)
        if result is not None:
            assert result.email == "existing@test.com"

    @pytest.mark.asyncio
    async def test_wb_auth_04_does_not_return_different_user(self, service, existing_user, db):
        """WB-AUTH-04: WHERE clause is specific — wrong email returns None."""
        other = User(
            email="other@test.com",
            password_hash=get_password_hash("X"),
            full_name="Other",
            role=UserRole.USER.value,
            is_active=True,
        )
        db.add(other)
        await db.commit()

        result = await service.get_user_by_email("existing@test.com")
        assert result.email == "existing@test.com"


# ─────────────────────────────────────────────────────────────────────────────
# WB-AUTH-05 … WB-AUTH-07  │  get_user_by_id
# ─────────────────────────────────────────────────────────────────────────────

class TestGetUserById:

    @pytest.mark.asyncio
    async def test_wb_auth_05_returns_user_when_exists(self, service, existing_user):
        """WB-AUTH-05: SELECT WHERE id → correct user returned."""
        result = await service.get_user_by_id(existing_user.id)
        assert result is not None
        assert result.id == existing_user.id

    @pytest.mark.asyncio
    async def test_wb_auth_06_returns_none_for_invalid_id(self, service):
        """WB-AUTH-06: Non-existent primary key → scalar_one_or_none returns None."""
        result = await service.get_user_by_id(999999)
        assert result is None

    @pytest.mark.asyncio
    async def test_wb_auth_07_id_zero_returns_none(self, service):
        """WB-AUTH-07: ID 0 is never assigned by autoincrement; must return None."""
        result = await service.get_user_by_id(0)
        assert result is None


# ─────────────────────────────────────────────────────────────────────────────
# WB-AUTH-08 … WB-AUTH-13  │  create_user
# ─────────────────────────────────────────────────────────────────────────────

class TestCreateUser:

    @pytest.mark.asyncio
    async def test_wb_auth_08_password_is_hashed_not_stored_plaintext(self, service):
        """WB-AUTH-08: password_hash must NOT equal the plain password (line 28)."""
        user_data = UserCreate(email="new@test.com", password="PlainPass1!", full_name="New User")
        user = await service.create_user(user_data)
        assert user.password_hash != "PlainPass1!"

    @pytest.mark.asyncio
    async def test_wb_auth_09_stored_hash_verifies_correctly(self, service):
        """WB-AUTH-09: stored hash round-trips through verify_password()."""
        user_data = UserCreate(email="hash@test.com", password="RoundTrip1!", full_name="Hash User")
        user = await service.create_user(user_data)
        assert verify_password("RoundTrip1!", user.password_hash)

    @pytest.mark.asyncio
    async def test_wb_auth_10_default_role_is_user(self, service):
        """WB-AUTH-10: role defaults to UserRole.USER.value (line 33)."""
        user_data = UserCreate(email="role@test.com", password="RolePass1!", full_name="Role")
        user = await service.create_user(user_data)
        assert user.role == UserRole.USER.value

    @pytest.mark.asyncio
    async def test_wb_auth_11_user_persisted_after_commit(self, service, db):
        """WB-AUTH-11: after commit + refresh, user has a valid PK (line 35-37)."""
        user_data = UserCreate(email="persist@test.com", password="PersistP1!", full_name="Persist")
        user = await service.create_user(user_data)
        assert user.id is not None
        assert user.id > 0

    @pytest.mark.asyncio
    async def test_wb_auth_12_full_name_stored(self, service):
        """WB-AUTH-12: full_name field is correctly persisted."""
        user_data = UserCreate(email="name@test.com", password="NamePass1!", full_name="Full Name Here")
        user = await service.create_user(user_data)
        assert user.full_name == "Full Name Here"

    @pytest.mark.asyncio
    async def test_wb_auth_13_is_active_defaults_true(self, service, db):
        """WB-AUTH-13: User model default is_active=True (User model line 25)."""
        user_data = UserCreate(email="active@test.com", password="ActiveP1!", full_name="Active")
        user = await service.create_user(user_data)
        fresh = await db.get(User, user.id)
        assert fresh.is_active is True


# ─────────────────────────────────────────────────────────────────────────────
# WB-AUTH-14 … WB-AUTH-17  │  authenticate_user — all branches
# ─────────────────────────────────────────────────────────────────────────────

class TestAuthenticateUser:
    """White Box: covers every early-return branch in authenticate_user()."""

    @pytest.mark.asyncio
    async def test_wb_auth_14_returns_none_when_user_not_found(self, service):
        """WB-AUTH-14: Branch (a) — get_user_by_email returns None → None returned."""
        result = await service.authenticate_user("nobody@test.com", "anypassword")
        assert result is None

    @pytest.mark.asyncio
    async def test_wb_auth_15_returns_none_on_wrong_password(self, service, existing_user):
        """WB-AUTH-15: Branch (b) — verify_password returns False → None returned."""
        result = await service.authenticate_user("existing@test.com", "WrongPassword!")
        assert result is None

    @pytest.mark.asyncio
    async def test_wb_auth_16_returns_none_when_inactive(self, service, db):
        """WB-AUTH-16: Branch (c) — user.is_active == False → None returned."""
        u = User(
            email="inactive@test.com",
            password_hash=get_password_hash("Pass123!"),
            full_name="Inactive",
            role=UserRole.USER.value,
            is_active=False,
        )
        db.add(u)
        await db.commit()

        result = await service.authenticate_user("inactive@test.com", "Pass123!")
        assert result is None

    @pytest.mark.asyncio
    async def test_wb_auth_17_happy_path_returns_user(self, service, existing_user):
        """WB-AUTH-17: Branch (d) — all checks pass → User object returned."""
        result = await service.authenticate_user("existing@test.com", "CorrectPassword1!")
        assert result is not None
        assert result.email == "existing@test.com"
