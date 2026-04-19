"""
WHITE BOX TESTS — app/core/security.py
======================================
White Box Testing: tester has full knowledge of internal implementation.
Tests verify internal logic branches, data structures, and edge cases
based on reading the actual source code.

Modules under test:
  - verify_password()
  - get_password_hash()
  - create_access_token()
  - create_refresh_token()
  - decode_token()

Internal knowledge used:
  - bcrypt encodes input as UTF-8 before hashing
  - JWT payload always has keys: "exp", "sub", "type"
  - access tokens get type="access"; refresh tokens get type="refresh"
  - additional_claims are merged BEFORE core fields, so core fields cannot be overwritten (BUG-002 fix)
  - decode_token() returns None on ANY JWTError (including expiry)
  - SECRET_KEY and ALGORITHM come from settings singleton
"""

import pytest
import time
from datetime import timedelta
from jose import jwt

from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.core.config import get_settings

settings = get_settings()

# ─────────────────────────────────────────────────────────────────────────────
# WB-SEC-01 … WB-SEC-06  │  get_password_hash
# ─────────────────────────────────────────────────────────────────────────────

class TestGetPasswordHash:
    """White Box: verify bcrypt internals."""

    def test_wb_sec_01_returns_string(self):
        """WB-SEC-01: hash() must return a plain Python str (not bytes)."""
        result = get_password_hash("password")
        assert isinstance(result, str), "Expected str, bcrypt decode() must be called"

    def test_wb_sec_02_bcrypt_prefix(self):
        """WB-SEC-02: bcrypt hashes always start with $2b$ sentinel."""
        h = get_password_hash("any_password")
        assert h.startswith("$2b$"), f"Unexpected bcrypt format: {h[:10]}"

    def test_wb_sec_03_salted_uniqueness(self):
        """WB-SEC-03: two calls with same input produce different hashes (random salt)."""
        h1 = get_password_hash("same_password")
        h2 = get_password_hash("same_password")
        assert h1 != h2, "bcrypt must generate a unique salt per call"

    def test_wb_sec_04_empty_string_hashable(self):
        """WB-SEC-04: empty-string password is hashable (bcrypt accepts it)."""
        h = get_password_hash("")
        assert h.startswith("$2b$")

    def test_wb_sec_05_unicode_encoded_utf8(self):
        """WB-SEC-05: Unicode password must be accepted (internal UTF-8 encoding)."""
        h = get_password_hash("pässwörd_😀")
        assert h.startswith("$2b$")

    def test_wb_sec_06_long_password_raises_for_over_72_bytes(self):
        """WB-SEC-06: This bcrypt version RAISES ValueError for passwords >72 bytes.

        Unlike older passlib behaviour, the bcrypt library used here enforces a
        hard limit and raises ValueError rather than silently truncating.
        This test documents the actual behaviour so callers know to pre-truncate.
        """
        long_password = "A" * 73
        with pytest.raises(ValueError):
            get_password_hash(long_password)


# ─────────────────────────────────────────────────────────────────────────────
# WB-SEC-07 … WB-SEC-10  │  verify_password
# ─────────────────────────────────────────────────────────────────────────────

class TestVerifyPassword:
    """White Box: verify internal comparison branch."""

    def test_wb_sec_07_correct_password_returns_true(self):
        """WB-SEC-07: matching plain text → True branch of checkpw()."""
        h = get_password_hash("correct_horse_battery_staple")
        assert verify_password("correct_horse_battery_staple", h) is True

    def test_wb_sec_08_wrong_password_returns_false(self):
        """WB-SEC-08: wrong plain text → False branch of checkpw()."""
        h = get_password_hash("right_password")
        assert verify_password("wrong_password", h) is False

    def test_wb_sec_09_case_sensitivity(self):
        """WB-SEC-09: passwords are case-sensitive (UTF-8 bytes differ)."""
        h = get_password_hash("Password")
        assert verify_password("password", h) is False

    def test_wb_sec_10_hash_reuse_still_valid(self):
        """WB-SEC-10: same hash verified multiple times (state-free function)."""
        h = get_password_hash("reuse_me")
        assert verify_password("reuse_me", h) is True
        assert verify_password("reuse_me", h) is True


# ─────────────────────────────────────────────────────────────────────────────
# WB-SEC-11 … WB-SEC-18  │  create_access_token
# ─────────────────────────────────────────────────────────────────────────────

class TestCreateAccessToken:
    """White Box: inspect JWT payload structure directly."""

    def _decode(self, token: str) -> dict:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])

    def test_wb_sec_11_payload_has_required_keys(self):
        """WB-SEC-11: payload must contain exp, sub, type (from source line 37)."""
        token = create_access_token(subject=42)
        payload = self._decode(token)
        assert "exp" in payload
        assert "sub" in payload
        assert "type" in payload

    def test_wb_sec_12_type_is_access(self):
        """WB-SEC-12: type field must be 'access' (hard-coded in implementation)."""
        token = create_access_token(subject=1)
        payload = self._decode(token)
        assert payload["type"] == "access"

    def test_wb_sec_13_sub_is_string(self):
        """WB-SEC-13: sub is always cast to str() even when int is given."""
        token = create_access_token(subject=99)
        payload = self._decode(token)
        assert payload["sub"] == "99"

    def test_wb_sec_14_additional_claims_merged(self):
        """WB-SEC-14: additional_claims are merged via dict.update() (line 39)."""
        token = create_access_token(subject=1, additional_claims={"role": "admin", "tenant": "acme"})
        payload = self._decode(token)
        assert payload["role"] == "admin"
        assert payload["tenant"] == "acme"

    def test_wb_sec_15_custom_expires_delta_respected(self):
        """WB-SEC-15: custom expires_delta overrides settings default (line 33-35)."""
        before = int(time.time())
        token = create_access_token(subject=1, expires_delta=timedelta(hours=2))
        payload = self._decode(token)
        # Allow ±10 s tolerance
        expected_exp = before + 7200
        assert abs(payload["exp"] - expected_exp) < 10

    def test_wb_sec_16_default_expiry_uses_settings(self):
        """WB-SEC-16: default expiry matches settings.access_token_expire_minutes."""
        before = int(time.time())
        token = create_access_token(subject=1)
        payload = self._decode(token)
        expected_exp = before + (settings.access_token_expire_minutes * 60)
        assert abs(payload["exp"] - expected_exp) < 10

    def test_wb_sec_17_additional_claims_cannot_overwrite_type(self):
        """WB-SEC-17: core fields are set AFTER additional_claims — overwrite blocked (BUG-002 fix)."""
        token = create_access_token(subject=1, additional_claims={"type": "superuser"})
        payload = self._decode(token)
        # After fix: core fields are immutable; 'type' stays 'access'
        assert payload["type"] == "access"

    def test_wb_sec_18_algorithm_used_is_hs256(self):
        """WB-SEC-18: token must be decodable with HS256 only."""
        token = create_access_token(subject=1)
        # Should succeed with correct algorithm
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        assert payload["sub"] == "1"


# ─────────────────────────────────────────────────────────────────────────────
# WB-SEC-19 … WB-SEC-21  │  create_refresh_token
# ─────────────────────────────────────────────────────────────────────────────

class TestCreateRefreshToken:
    """White Box: verify refresh token payload."""

    def _decode(self, token: str) -> dict:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])

    def test_wb_sec_19_type_is_refresh(self):
        """WB-SEC-19: type must be 'refresh' (line 48 of security.py)."""
        token = create_refresh_token(subject=1)
        payload = self._decode(token)
        assert payload["type"] == "refresh"

    def test_wb_sec_20_expiry_uses_days_setting(self):
        """WB-SEC-20: exp set to refresh_token_expire_days from settings."""
        before = int(time.time())
        token = create_refresh_token(subject=1)
        payload = self._decode(token)
        expected_exp = before + (settings.refresh_token_expire_days * 86400)
        assert abs(payload["exp"] - expected_exp) < 10

    def test_wb_sec_21_no_additional_claims_parameter(self):
        """WB-SEC-21: refresh token has no additional_claims support (only 3 keys)."""
        token = create_refresh_token(subject=5)
        payload = self._decode(token)
        # Exactly exp, sub, type — no extras
        assert set(payload.keys()) == {"exp", "sub", "type"}


# ─────────────────────────────────────────────────────────────────────────────
# WB-SEC-22 … WB-SEC-25  │  decode_token
# ─────────────────────────────────────────────────────────────────────────────

class TestDecodeToken:
    """White Box: test all branches of the try/except JWTError block."""

    def test_wb_sec_22_valid_token_returns_dict(self):
        """WB-SEC-22: happy path — valid token returns payload dict."""
        token = create_access_token(subject=7)
        result = decode_token(token)
        assert isinstance(result, dict)
        assert result["sub"] == "7"

    def test_wb_sec_23_expired_token_returns_none(self):
        """WB-SEC-23: expired token triggers JWTError → returns None (line 58)."""
        token = create_access_token(subject=1, expires_delta=timedelta(seconds=-1))
        result = decode_token(token)
        assert result is None

    def test_wb_sec_24_garbage_token_returns_none(self):
        """WB-SEC-24: completely invalid string → JWTError → None."""
        result = decode_token("this.is.garbage")
        assert result is None

    def test_wb_sec_25_wrong_secret_returns_none(self):
        """WB-SEC-25: token signed with wrong key triggers JWTError → None."""
        from jose import jwt as jose_jwt
        bad_token = jose_jwt.encode({"sub": "1", "type": "access"}, "wrong-key", algorithm="HS256")
        result = decode_token(bad_token)
        assert result is None
