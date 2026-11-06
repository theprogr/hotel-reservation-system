"""Password hashing, login tokens, and who-can-do-what checks."""
import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .db import fetch_one

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
TOKEN_LIFETIME = timedelta(hours=12)

bearer = HTTPBearer(auto_error=False)
# Checked when an email doesn't exist, so a login takes the same time either way
# and attackers can't use response time to discover which emails are registered.
_DUMMY_HASH = bcrypt.hashpw(b"not-a-real-password", bcrypt.gensalt())


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode()[:72], bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str | None) -> bool:
    if password_hash is None:
        bcrypt.checkpw(password.encode()[:72], _DUMMY_HASH)
        return False
    return bcrypt.checkpw(password.encode()[:72], password_hash.encode())


def create_token(user_id: int, kind: str) -> str:
    payload = {
        "sub": str(user_id),
        "kind": kind,
        "exp": datetime.now(timezone.utc) + TOKEN_LIFETIME,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def load_user(user_id: int, kind: str) -> dict | None:
    """Read the account fresh, so deleted accounts and role changes apply immediately."""
    if kind == "guest":
        row = fetch_one("SELECT id, name, email, phone FROM guests WHERE id = %s", (user_id,))
        return {**row, "kind": "guest", "access_level": None, "hotel_id": None} if row else None
    row = fetch_one(
        """SELECT e.id, e.first_name || ' ' || e.last_name AS name, e.email, e.phone, e.hotel_id,
                  r.role_name, r.access_level
           FROM employees e JOIN roles r ON r.id = e.role_id
           WHERE e.id = %s""",
        (user_id,),
    )
    return {**row, "kind": "employee"} if row else None


def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict:
    if credentials is None:
        raise HTTPException(401, "Please log in.")
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = load_user(int(payload["sub"]), payload["kind"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise HTTPException(401, "Your session is invalid. Please log in again.")
    if user is None:
        raise HTTPException(401, "This account no longer exists.")
    return user


def require_guest(user: dict = Depends(current_user)) -> dict:
    if user["kind"] != "guest":
        raise HTTPException(403, "Only guest accounts can do this.")
    return user


def require_staff(*levels: str):
    """Allow employees with one of these access levels. Admins always pass."""

    def check(user: dict = Depends(current_user)) -> dict:
        if user["kind"] != "employee":
            raise HTTPException(403, "Staff access only.")
        if user["access_level"] != "admin" and user["access_level"] not in levels:
            raise HTTPException(403, "Your role doesn't allow this.")
        return user

    return check


def hotel_scope(user: dict) -> int | None:
    """The hotel this employee is limited to. None means all hotels (admins)."""
    return None if user["access_level"] == "admin" else user["hotel_id"]


def ensure_same_hotel(user: dict, hotel_id: int) -> None:
    scope = hotel_scope(user)
    if scope is not None and scope != hotel_id:
        raise HTTPException(403, "That belongs to a different hotel.")
