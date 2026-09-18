"""Authentication endpoints: register, login, refresh, me."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DbSession
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.user import User
from app.schemas.common import Message
from app.schemas.user import LoginRequest, RefreshRequest, Token, UserCreate, UserRead

router = APIRouter(prefix="/auth", tags=["auth"])


def _issue_tokens(user: User) -> Token:
    return Token(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
        user=UserRead.model_validate(user),
    )


@router.post(
    "/register",
    response_model=Token,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
)
def register(payload: UserCreate, db: DbSession) -> Token:
    """Create an account and return a JWT pair.

    The first account ever created is promoted to `admin` so the deployed demo is
    usable without a database bootstrap step; later sign-ups default to viewer.
    """
    existing = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    is_first_user = db.execute(select(func.count(User.id))).scalar_one() == 0
    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=payload.role if not is_first_user else "admin",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _issue_tokens(user)


@router.post("/login", response_model=Token, summary="Exchange credentials for a JWT pair")
def login(payload: LoginRequest, db: DbSession) -> Token:
    user = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    # Same message for unknown email and bad password: do not leak which accounts exist.
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user account")
    return _issue_tokens(user)


@router.post("/refresh", response_model=Token, summary="Rotate an access token")
def refresh(payload: RefreshRequest, db: DbSession) -> Token:
    claims = decode_token(payload.refresh_token, expected_type="refresh")
    if claims is None or not claims.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        )
    try:
        user = db.get(User, uuid.UUID(str(claims["sub"])))
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        ) from exc
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User unavailable")
    return _issue_tokens(user)


@router.get("/me", response_model=UserRead, summary="Current user profile")
def me(current_user: CurrentUser) -> UserRead:
    return UserRead.model_validate(current_user)


@router.post("/logout", response_model=Message, summary="Logout (stateless)")
def logout() -> Message:
    """JWTs are stateless, so logout is a client-side discard.

    Kept as an explicit endpoint so the frontend has one place to route the action
    and so a token denylist can be added later without changing the client.
    """
    return Message(detail="Successfully logged out")
