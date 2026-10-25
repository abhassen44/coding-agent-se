"""Tests for short-lived live-preview tokens."""
from datetime import timedelta

from app.core.security import (
    create_access_token,
    create_preview_token,
    decode_preview_token,
    decode_token,
)


def test_preview_token_round_trip():
    token = create_preview_token(7, workspace_id=12, port=5173)
    payload = decode_preview_token(token)
    assert payload is not None
    assert payload["sub"] == "7"
    assert payload["workspace_id"] == 12
    assert payload["port"] == 5173
    assert payload["type"] == "preview"


def test_preview_token_rejects_access_tokens():
    token = create_access_token(7)
    assert decode_preview_token(token) is None


def test_preview_token_expires():
    token = create_preview_token(
        7, workspace_id=12, port=3000, expires_delta=timedelta(seconds=-1)
    )
    assert decode_preview_token(token) is None


def test_decode_token_accepts_preview_tokens():
    # decode_token is the generic decoder; callers must check "type".
    token = create_preview_token(7, workspace_id=12, port=8000)
    payload = decode_token(token)
    assert payload is not None
    assert payload["type"] == "preview"
