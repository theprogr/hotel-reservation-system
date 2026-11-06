import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from psycopg import errors

from . import schemas
from .crud import crud_router
from .db import pool
from .routers import auth, public, reservations, staff
from .security import require_staff


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool.open()
    yield
    pool.close()


app = FastAPI(title="Hotel Reservation API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")],
    allow_methods=["*"],
    allow_headers=["*"],
)

# The database enforces the rules. These turn its errors into clear messages,
# without exposing internal table details to the browser.
UNIQUE_MESSAGES = {
    "guests_email_unique": "This email is already registered.",
    "employees_email_unique": "This email is already registered.",
    "rooms_hotel_id_room_number_key": "This hotel already has a room with that number.",
    "roles_role_name_key": "A role with that name already exists.",
    "one_paid_payment_per_reservation": "This reservation is already paid.",
}


@app.exception_handler(errors.ExclusionViolation)
def double_booking(_: Request, __: errors.ExclusionViolation):
    return JSONResponse({"detail": "This room was just booked for those dates. Please choose another room or date."}, 409)


@app.exception_handler(errors.UniqueViolation)
def duplicate(_: Request, e: errors.UniqueViolation):
    return JSONResponse({"detail": UNIQUE_MESSAGES.get(e.diag.constraint_name, "That value already exists.")}, 409)


@app.exception_handler(errors.ForeignKeyViolation)
def still_linked(_: Request, __: errors.ForeignKeyViolation):
    return JSONResponse({"detail": "This is linked to other records, so it can't be changed or deleted."}, 409)


@app.exception_handler(errors.CheckViolation)
def invalid_value(_: Request, __: errors.CheckViolation):
    return JSONResponse({"detail": "One of the values isn't allowed."}, 422)


@app.exception_handler(errors.NotNullViolation)
def missing_value(_: Request, e: errors.NotNullViolation):
    return JSONResponse({"detail": f"{e.diag.column_name} is required."}, 422)


app.include_router(auth.router)
app.include_router(public.router)
app.include_router(reservations.router)
app.include_router(staff.router)

admin_only = [Depends(require_staff())]  # no levels listed: admins pass, everyone else gets 403
app.include_router(crud_router("hotels", "/admin/hotels", schemas.HotelIn, admin_only))
app.include_router(crud_router("roles", "/admin/roles", schemas.RoleIn, admin_only))


@app.get("/health", tags=["public"])
def health():
    return {"status": "ok"}
