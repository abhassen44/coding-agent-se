from datetime import datetime, timedelta
from typing import Any, Optional
import bcrypt
from jose import JWTError, jwt

from app.core.config import get_settings

settings = get_settings()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    password_bytes = plain_password.encode('utf-8')
    hash_bytes = hashed_password.encode('utf-8')
    return bcrypt.checkpw(password_bytes, hash_bytes)


def get_password_hash(password: str) -> str:
    """Hash a password using bcrypt."""
    password_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode('utf-8')


def create_access_token(
    subject: str | int,
    expires_delta: Optional[timedelta] = None,
    additional_claims: dict[str, Any] | None = None
) -> str:
    """Create a JWT access token."""
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    
    to_encode = {}
    if additional_claims:
        to_encode.update(additional_claims)
    # Core fields set AFTER additional_claims to prevent overwrite
    to_encode.update({"exp": expire, "sub": str(subject), "type": "access"})
    
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt


def create_refresh_token(subject: str | int) -> str:
    """Create a JWT refresh token."""
    expire = datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days)
    to_encode = {"exp": expire, "sub": str(subject), "type": "refresh"}
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt


def create_preview_token(
    subject: str | int,
    workspace_id: int,
    port: int,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create a short-lived token for iframe live-preview requests.

    Iframe navigations cannot attach an Authorization header, so the token is
    embedded in the proxy URL path. It is scoped to one user, workspace, and port.
    """
    minutes = settings.preview_token_expire_minutes
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=minutes))
    to_encode = {
        "exp": expire,
        "sub": str(subject),
        "type": "preview",
        "workspace_id": workspace_id,
        "port": port,
    }
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def create_ws_ticket(
    subject: str | int,
    workspace_id: int,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create a very short-lived ticket for the terminal WebSocket."""
    expire = datetime.utcnow() + (expires_delta or timedelta(seconds=60))
    to_encode = {
        "exp": expire,
        "sub": str(subject),
        "type": "ws",
        "workspace_id": workspace_id,
    }
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def decode_ws_ticket(token: str) -> dict[str, Any] | None:
    """Decode a terminal ticket and reject other token types."""
    payload = decode_token(token)
    if payload is None or payload.get("type") != "ws":
        return None
    return payload


def decode_preview_token(token: str) -> dict[str, Any] | None:
    """Decode a preview token and reject non-preview token types."""
    payload = decode_token(token)
    if payload is None or payload.get("type") != "preview":
        return None
    return payload


def decode_token(token: str) -> dict[str, Any] | None:
    """Decode and validate a JWT token."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        return payload
    except JWTError:
        return None
