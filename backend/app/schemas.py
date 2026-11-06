"""The shape and limits of data the API accepts."""
from datetime import date
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field, model_validator

RoomType = Literal["single", "double", "twin", "deluxe", "suite"]
RoomStatus = Literal["available", "maintenance", "out_of_service"]
PaymentMethod = Literal["card", "cash", "kaspi", "bank_transfer"]
AccessLevel = Literal["admin", "manager", "front_desk", "maintenance", "staff"]

MAX_NIGHTS = 60


class StayDates(BaseModel):
    check_in: date
    check_out: date

    @model_validator(mode="after")
    def check_dates(self):
        validate_stay(self.check_in, self.check_out)
        return self


def validate_stay(check_in: date, check_out: date) -> None:
    if check_in < date.today():
        raise ValueError("Check-in can't be in the past.")
    if check_out <= check_in:
        raise ValueError("Check-out must be after check-in.")
    if (check_out - check_in).days > MAX_NIGHTS:
        raise ValueError(f"A stay can't be longer than {MAX_NIGHTS} nights.")


# --- Accounts ---
class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    phone: Optional[str] = Field(None, max_length=20)
    password: str = Field(min_length=8, max_length=72)


class LoginIn(BaseModel):
    email: str = Field(max_length=255)
    password: str = Field(max_length=72)


# --- Bookings ---
class ReservationIn(StayDates):
    room_id: int


class PaymentIn(BaseModel):
    # Simulated: no card details are ever collected or stored.
    payment_method: PaymentMethod


class ReservationStatusIn(BaseModel):
    status: Literal["checked_in", "checked_out", "no_show"]


# --- Admin: same style as the original project's models ---
class HotelIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    address: Optional[str] = Field(None, max_length=255)
    city: str = Field(min_length=1, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)


class RoleIn(BaseModel):
    role_name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=255)
    access_level: AccessLevel = "staff"


# --- Staff ---
class RoomIn(BaseModel):
    hotel_id: Optional[int] = None  # managers: always their own hotel
    room_number: int = Field(gt=0)
    room_type: RoomType
    price_per_night: Decimal = Field(ge=0, max_digits=10, decimal_places=2)
    status: RoomStatus = "available"


class RoomUpdate(BaseModel):
    room_number: Optional[int] = Field(None, gt=0)
    room_type: Optional[RoomType] = None
    price_per_night: Optional[Decimal] = Field(None, ge=0, max_digits=10, decimal_places=2)
    status: Optional[RoomStatus] = None


class MaintenanceIn(BaseModel):
    room_id: int
    employee_id: int
    task_type: str = Field(min_length=1, max_length=100)


class MaintenanceUpdate(BaseModel):
    status: Literal["in_progress", "completed", "cancelled"]


class EmployeeIn(BaseModel):
    hotel_id: Optional[int] = None  # managers: always their own hotel
    role_id: int
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)
    email: EmailStr
    hire_date: Optional[date] = None
    salary: Optional[Decimal] = Field(None, ge=0, max_digits=10, decimal_places=2)
    password: str = Field(min_length=8, max_length=72)


class EmployeeUpdate(BaseModel):
    hotel_id: Optional[int] = None
    role_id: Optional[int] = None
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[EmailStr] = None
    hire_date: Optional[date] = None
    salary: Optional[Decimal] = Field(None, ge=0, max_digits=10, decimal_places=2)
    password: Optional[str] = Field(None, min_length=8, max_length=72)
