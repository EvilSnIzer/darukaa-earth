"""Password hashing and JWT creation/verification.

We use `bcrypt` directly rather than `passlib`: passlib's last release (1.7.4)
predates bcrypt 4.x and emits an `AttributeError` traceback on import. bcrypt is
a single well-maintained primitive, so wrapping it ourselves removes a stale
transitive dependency.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import bcrypt
import jwt

from app.core.config import settings

TokenType = Literal["access", "refresh"]

# bcrypt truncates input at 72 bytes; hashing longer secrets silently weakens them.
_BCRYPT_MAX_BYTES = 72


def _normalise_secret(secret: str) -> bytes:
    encoded = secret.encode("utf-8")
    if len(encoded) > _BCRYPT_MAX_BYTES:
        raise ValueError(
            f"Password exceeds bcrypt's {_BCRYPT_MAX_BYTES}-byte limit; use a shorter password."
        )
    return encoded


def hash_password(password: str) -> str:
    """Return a salted bcrypt hash of `password`."""
    return bcrypt.hashpw(_normalise_secret(password), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Constant-time comparison of a plaintext password against a stored hash."""
    try:
        return bcrypt.checkpw(_normalise_secret(plain_password), hashed_password.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def _create_token(subject: str, token_type: TokenType, expires_delta: timedelta) -> str:
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": subject,
        "jti": uuid.uuid4().hex,
        "iat": now,
        "exp": now + expires_delta,
        "type": token_type,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_access_token(subject: str) -> str:
    return _create_token(
        subject,
        "access",
        timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )


def create_refresh_token(subject: str) -> str:
    return _create_token(
        subject,
        "refresh",
        timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )


def decode_token(token: str, expected_type: TokenType = "access") -> dict[str, Any] | None:
    """Decode and validate a JWT. Returns the claims dict, or None if invalid."""
    try:
        payload: dict[str, Any] = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            options={"require": ["exp", "sub", "type"]},
        )
    except jwt.PyJWTError:
        return None

    if payload.get("type") != expected_type:
        return None
    return payload
