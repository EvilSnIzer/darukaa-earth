"""Authentication and authorisation behaviour."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import create_access_token, create_refresh_token, hash_password
from app.models.user import User, UserRole
from app.schemas.user import UserRead


def test_register_returns_tokens_and_user(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "new.user@darukaa-test.example.com",
            "full_name": "New User",
            "password": "StrongPass#123",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["user"]["email"] == "new.user@darukaa-test.example.com"


def test_register_duplicate_email_conflicts(client: TestClient, admin_user: User) -> None:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": admin_user.email,
            "full_name": "Impostor",
            "password": "StrongPass#123",
        },
    )
    assert response.status_code == 409


def test_register_rejects_weak_password(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "weak@darukaa-test.example.com", "full_name": "Weak", "password": "short"},
    )
    assert response.status_code == 422


def test_login_success(client: TestClient, admin_user: User) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": admin_user.email, "password": "Admin@12345"},
    )
    assert response.status_code == 200
    assert response.json()["access_token"]


def test_login_wrong_password_is_401(client: TestClient, admin_user: User) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": admin_user.email, "password": "not-the-password"},
    )
    assert response.status_code == 401


def test_login_unknown_email_returns_same_error_as_bad_password(
    client: TestClient,
) -> None:
    """Account enumeration must not be possible."""
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "ghost@darukaa-test.example.com", "password": "whatever123"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect email or password"


def test_me_requires_token(client: TestClient) -> None:
    assert client.get("/api/v1/auth/me").status_code == 401


def test_me_returns_current_user(admin_client: TestClient, admin_user: User) -> None:
    response = admin_client.get("/api/v1/auth/me")
    assert response.status_code == 200
    assert response.json()["email"] == admin_user.email


def test_refresh_rotates_tokens(client: TestClient, admin_user: User) -> None:
    refresh = create_refresh_token(str(admin_user.id))
    response = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert response.status_code == 200
    assert response.json()["access_token"]


def test_access_token_rejected_as_refresh_token(client: TestClient, admin_user: User) -> None:
    access = create_access_token(str(admin_user.id))
    response = client.post("/api/v1/auth/refresh", json={"refresh_token": access})
    assert response.status_code == 401


def test_tampered_token_rejected(client: TestClient) -> None:
    response = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer not.a.real.token"})
    assert response.status_code == 401


def test_inactive_user_blocked(db: Session, client: TestClient) -> None:
    user = User(
        email="inactive@darukaa-test.example.com",
        full_name="Inactive",
        hashed_password=hash_password("Passw0rd!23"),
        role=UserRole.viewer,
        is_active=False,
    )
    db.add(user)
    db.commit()
    token = create_access_token(str(user.id))
    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403


def test_password_is_hashed_not_stored_plaintext(db: Session, admin_user: User) -> None:
    assert admin_user.hashed_password != "Admin@12345"
    assert admin_user.hashed_password.startswith("$2b$")


def test_viewer_cannot_create_project(viewer_client: TestClient) -> None:
    response = viewer_client.post(
        "/api/v1/projects", json={"name": "Viewer Should Fail", "project_type": "reforestation"}
    )
    assert response.status_code == 403


def test_user_read_schema_hides_password(admin_user: User) -> None:
    payload = UserRead.model_validate(admin_user).model_dump()
    assert "hashed_password" not in payload
    assert "password" not in payload
