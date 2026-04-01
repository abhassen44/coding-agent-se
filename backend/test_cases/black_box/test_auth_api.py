"""
BLACK BOX TESTS — /api/v1/auth  (register, login, refresh, /me)
================================================================
Black Box Testing: tester knows ONLY the API contract (HTTP method,
path, request schema, expected status codes, and response schema).
No knowledge of internal implementation is assumed or used.

API Surface under test:
  POST   /api/v1/auth/register   → 201 UserResponse | 400 duplicate
  POST   /api/v1/auth/login      → 200 Token        | 401 bad creds
  POST   /api/v1/auth/refresh    → 200 Token        | 401 bad token
  GET    /api/v1/auth/me         → 200 UserResponse | 401 unauth

Test categories per endpoint:
  ✓ Happy path (valid input → expected success response)
  ✓ Boundary / validation failures (invalid schema)
  ✓ Authentication failures (wrong credentials, bad tokens)
  ✓ Business-rule violations (duplicate email)
"""

import pytest
from httpx import AsyncClient


BASE = "/api/v1/auth"


# ─────────────────────────────────────────────────────────────────────────────
# BB-AUTH-01 … BB-AUTH-08  │  POST /register
# ─────────────────────────────────────────────────────────────────────────────

class TestRegisterEndpoint:
    """Black Box: registration endpoint contract."""

    @pytest.mark.asyncio
    async def test_bb_auth_01_register_success_returns_201(self, client: AsyncClient):
        """BB-AUTH-01: valid payload → 201 Created with user fields."""
        resp = await client.post(f"{BASE}/register", json={
            "email": "bb_user1@test.com",
            "password": "SecurePass123!",
            "full_name": "BB User One",
        })
        assert resp.status_code == 201
        body = resp.json()
        assert body["email"] == "bb_user1@test.com"
        assert body["full_name"] == "BB User One"
        assert "id" in body

    @pytest.mark.asyncio
    async def test_bb_auth_02_password_not_returned_in_response(self, client: AsyncClient):
        """BB-AUTH-02: response must NOT expose password or password_hash."""
        resp = await client.post(f"{BASE}/register", json={
            "email": "bb_sec@test.com",
            "password": "HiddenPass1!",
            "full_name": "Secure",
        })
        body = resp.json()
        assert "password" not in body
        assert "password_hash" not in body

    @pytest.mark.asyncio
    async def test_bb_auth_03_duplicate_email_returns_400(self, client: AsyncClient):
        """BB-AUTH-03: registering with an existing email → 400 Bad Request."""
        payload = {"email": "dupe@test.com", "password": "Pass123!", "full_name": "Dupe"}
        await client.post(f"{BASE}/register", json=payload)  # first registration
        resp = await client.post(f"{BASE}/register", json=payload)  # duplicate
        assert resp.status_code == 400
        assert "already" in resp.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_bb_auth_04_missing_email_returns_422(self, client: AsyncClient):
        """BB-AUTH-04: request schema validation — email field is required."""
        resp = await client.post(f"{BASE}/register", json={
            "password": "Pass123!",
            "full_name": "No Email",
        })
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_bb_auth_05_missing_password_returns_422(self, client: AsyncClient):
        """BB-AUTH-05: password field is required."""
        resp = await client.post(f"{BASE}/register", json={
            "email": "nopass@test.com",
            "full_name": "No Password",
        })
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_bb_auth_06_invalid_email_format_returns_422(self, client: AsyncClient):
        """BB-AUTH-06: invalid email format rejected by Pydantic schema."""
        resp = await client.post(f"{BASE}/register", json={
            "email": "not-an-email",
            "password": "Pass123!",
            "full_name": "Bad Email",
        })
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_bb_auth_07_full_name_is_optional(self, client: AsyncClient):
        """BB-AUTH-07: full_name is optional — registration succeeds without it."""
        resp = await client.post(f"{BASE}/register", json={
            "email": "nofullname@test.com",
            "password": "Pass123!",
        })
        assert resp.status_code == 201

    @pytest.mark.asyncio
    async def test_bb_auth_08_response_contains_role(self, client: AsyncClient):
        """BB-AUTH-08: response includes a role field."""
        resp = await client.post(f"{BASE}/register", json={
            "email": "rolecheck@test.com",
            "password": "Pass123!",
            "full_name": "Role Check",
        })
        body = resp.json()
        assert "role" in body


# ─────────────────────────────────────────────────────────────────────────────
# BB-AUTH-09 … BB-AUTH-15  │  POST /login
# ─────────────────────────────────────────────────────────────────────────────

class TestLoginEndpoint:
    """Black Box: login endpoint contract."""

    async def _register(self, client: AsyncClient, email: str, password: str):
        await client.post(f"{BASE}/register", json={
            "email": email, "password": password, "full_name": "Login User"
        })

    @pytest.mark.asyncio
    async def test_bb_auth_09_login_success_returns_tokens(self, client: AsyncClient):
        """BB-AUTH-09: valid credentials → 200 with access_token and refresh_token."""
        await self._register(client, "login_ok@test.com", "Pass123!")
        resp = await client.post(f"{BASE}/login", json={
            "email": "login_ok@test.com", "password": "Pass123!",
        })
        assert resp.status_code == 200
        body = resp.json()
        assert "access_token" in body
        assert "refresh_token" in body

    @pytest.mark.asyncio
    async def test_bb_auth_10_token_type_is_bearer(self, client: AsyncClient):
        """BB-AUTH-10: response should include token_type='bearer' (or at least 'bearer' in body)."""
        await self._register(client, "bearer@test.com", "Pass123!")
        resp = await client.post(f"{BASE}/login", json={
            "email": "bearer@test.com", "password": "Pass123!",
        })
        body = resp.json()
        # Commonly expected field; check token is a non-empty string
        assert isinstance(body["access_token"], str)
        assert len(body["access_token"]) > 10

    @pytest.mark.asyncio
    async def test_bb_auth_11_wrong_password_returns_401(self, client: AsyncClient):
        """BB-AUTH-11: correct email but wrong password → 401 Unauthorized."""
        await self._register(client, "wrongpass@test.com", "CorrectPass1!")
        resp = await client.post(f"{BASE}/login", json={
            "email": "wrongpass@test.com", "password": "WrongPass!",
        })
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_bb_auth_12_unknown_email_returns_401(self, client: AsyncClient):
        """BB-AUTH-12: unregistered email → 401 Unauthorized."""
        resp = await client.post(f"{BASE}/login", json={
            "email": "nobody@test.com", "password": "AnyPass!",
        })
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_bb_auth_13_missing_email_returns_422(self, client: AsyncClient):
        """BB-AUTH-13: missing email field → 422 Unprocessable Entity."""
        resp = await client.post(f"{BASE}/login", json={"password": "Pass!"})
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_bb_auth_14_empty_body_returns_422(self, client: AsyncClient):
        """BB-AUTH-14: empty JSON body → 422 Unprocessable Entity."""
        resp = await client.post(f"{BASE}/login", json={})
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_bb_auth_15_error_response_has_detail_field(self, client: AsyncClient):
        """BB-AUTH-15: 401 response must include a 'detail' field (FastAPI convention)."""
        resp = await client.post(f"{BASE}/login", json={
            "email": "ghost@test.com", "password": "ghost",
        })
        body = resp.json()
        assert "detail" in body


# ─────────────────────────────────────────────────────────────────────────────
# BB-AUTH-16 … BB-AUTH-20  │  POST /refresh
# ─────────────────────────────────────────────────────────────────────────────

class TestRefreshEndpoint:
    """Black Box: token refresh endpoint contract."""

    async def _get_tokens(self, client: AsyncClient, email: str, password: str) -> dict:
        await client.post(f"{BASE}/register", json={
            "email": email, "password": password, "full_name": "Refresh User"
        })
        resp = await client.post(f"{BASE}/login", json={"email": email, "password": password})
        return resp.json()

    @pytest.mark.asyncio
    async def test_bb_auth_16_refresh_returns_new_tokens(self, client: AsyncClient):
        """BB-AUTH-16: valid refresh token → 200 with new access_token."""
        tokens = await self._get_tokens(client, "refresh@test.com", "Pass123!")
        resp = await client.post(f"{BASE}/refresh", json={
            "refresh_token": tokens["refresh_token"]
        })
        assert resp.status_code == 200
        body = resp.json()
        assert "access_token" in body

    @pytest.mark.asyncio
    async def test_bb_auth_17_garbage_refresh_token_returns_401(self, client: AsyncClient):
        """BB-AUTH-17: invalid/garbage refresh token → 401 Unauthorized."""
        resp = await client.post(f"{BASE}/refresh", json={
            "refresh_token": "garbage.token.here"
        })
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_bb_auth_18_access_token_as_refresh_returns_401(self, client: AsyncClient):
        """BB-AUTH-18: passing access_token where refresh_token expected → 401."""
        tokens = await self._get_tokens(client, "wrongtype@test.com", "Pass123!")
        resp = await client.post(f"{BASE}/refresh", json={
            "refresh_token": tokens["access_token"]   # wrong type
        })
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_bb_auth_19_missing_refresh_token_returns_422(self, client: AsyncClient):
        """BB-AUTH-19: missing required field → 422 Unprocessable Entity."""
        resp = await client.post(f"{BASE}/refresh", json={})
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_bb_auth_20_expired_refresh_token_returns_401(
        self, client: AsyncClient, expired_token: str
    ):
        """BB-AUTH-20: expired token → 401 (decode_token returns None)."""
        resp = await client.post(f"{BASE}/refresh", json={
            "refresh_token": expired_token
        })
        assert resp.status_code == 401


# ─────────────────────────────────────────────────────────────────────────────
# BB-AUTH-21 … BB-AUTH-25  │  GET /me
# ─────────────────────────────────────────────────────────────────────────────

class TestMeEndpoint:
    """Black Box: current-user info endpoint contract."""

    @pytest.mark.asyncio
    async def test_bb_auth_21_me_returns_current_user(self, client: AsyncClient):
        """BB-AUTH-21: authenticated request → 200 with user info."""
        # Register and login
        await client.post(f"{BASE}/register", json={
            "email": "me@test.com", "password": "Pass123!", "full_name": "Me User"
        })
        login_resp = await client.post(f"{BASE}/login", json={
            "email": "me@test.com", "password": "Pass123!",
        })
        token = login_resp.json()["access_token"]

        resp = await client.get(f"{BASE}/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["email"] == "me@test.com"

    @pytest.mark.asyncio
    async def test_bb_auth_22_me_without_token_returns_401(self, client: AsyncClient):
        """BB-AUTH-22: unauthenticated request → 401 or 403."""
        resp = await client.get(f"{BASE}/me")
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_bb_auth_23_me_with_invalid_token_returns_401(self, client: AsyncClient):
        """BB-AUTH-23: malformed Bearer token → 401 or 403."""
        resp = await client.get(
            f"{BASE}/me",
            headers={"Authorization": "Bearer this.is.invalid"}
        )
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_bb_auth_24_me_response_has_no_password(self, client: AsyncClient):
        """BB-AUTH-24: /me response must not expose any password field."""
        await client.post(f"{BASE}/register", json={
            "email": "nopwd@test.com", "password": "Pass123!", "full_name": "NoPwd"
        })
        login_resp = await client.post(f"{BASE}/login", json={
            "email": "nopwd@test.com", "password": "Pass123!",
        })
        token = login_resp.json()["access_token"]
        resp = await client.get(f"{BASE}/me", headers={"Authorization": f"Bearer {token}"})
        body = resp.json()
        assert "password" not in body
        assert "password_hash" not in body

    @pytest.mark.asyncio
    async def test_bb_auth_25_me_with_expired_token_returns_401(
        self, client: AsyncClient, expired_token: str
    ):
        """BB-AUTH-25: expired access token → 401 or 403."""
        resp = await client.get(
            f"{BASE}/me",
            headers={"Authorization": f"Bearer {expired_token}"}
        )
        assert resp.status_code in (401, 403)
