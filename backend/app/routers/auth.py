from fastapi import APIRouter, Depends, HTTPException

from ..db import fetch_one
from ..schemas import LoginIn, RegisterIn
from ..security import create_token, current_user, hash_password, load_user, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", status_code=201)
def register(body: RegisterIn):
    email = body.email.lower()
    if fetch_one("SELECT 1 AS found FROM employees WHERE LOWER(email) = %s", (email,)):
        raise HTTPException(409, "This email is already registered.")
    row = fetch_one(
        "INSERT INTO guests (name, email, phone, password_hash) VALUES (%s, %s, %s, %s) RETURNING id",
        (body.name, email, body.phone, hash_password(body.password)),
    )
    return {"token": create_token(row["id"], "guest"), "user": load_user(row["id"], "guest")}


@router.post("/login")
def login(body: LoginIn):
    email = body.email.strip().lower()
    employee = fetch_one("SELECT id, password_hash FROM employees WHERE LOWER(email) = %s", (email,))
    account, kind = (employee, "employee") if employee else (
        fetch_one("SELECT id, password_hash FROM guests WHERE LOWER(email) = %s", (email,)),
        "guest",
    )
    if not verify_password(body.password, account["password_hash"] if account else None):
        raise HTTPException(401, "Wrong email or password.")
    return {"token": create_token(account["id"], kind), "user": load_user(account["id"], kind)}


@router.get("/me")
def me(user: dict = Depends(current_user)):
    return user
