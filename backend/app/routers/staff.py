"""Staff tools. Every query is limited to the employee's hotel, except for admins."""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from ..crud import update_row
from ..db import fetch_all, fetch_one, pool
from ..schemas import (
    EmployeeIn, EmployeeUpdate, MaintenanceIn, MaintenanceUpdate,
    ReservationStatusIn, RoomIn, RoomUpdate,
)
from ..security import ensure_same_hotel, hash_password, hotel_scope, require_staff
from .reservations import DETAILS, locked_reservation

router = APIRouter(prefix="/staff", tags=["staff"])

desk = require_staff("manager", "front_desk")
managers = require_staff("manager")
any_staff = require_staff("manager", "front_desk", "maintenance")


# --- Dashboard ---
@router.get("/summary")
def summary(user: dict = Depends(any_staff)):
    row = fetch_one(
        """SELECT
             (SELECT COUNT(*) FROM rooms r WHERE (%(h)s::int IS NULL OR r.hotel_id = %(h)s)) AS total_rooms,
             (SELECT COUNT(*) FROM reservation_details d WHERE d.status = 'checked_in'
                AND (%(h)s::int IS NULL OR d.hotel_id = %(h)s)) AS occupied_rooms,
             (SELECT COUNT(*) FROM reservation_details d WHERE d.check_in = CURRENT_DATE
                AND d.status IN ('pending', 'confirmed') AND (%(h)s::int IS NULL OR d.hotel_id = %(h)s)) AS arrivals_today,
             (SELECT COUNT(*) FROM reservation_details d WHERE d.check_out = CURRENT_DATE
                AND d.status = 'checked_in' AND (%(h)s::int IS NULL OR d.hotel_id = %(h)s)) AS departures_today,
             (SELECT COUNT(*) FROM room_maintenance m JOIN rooms r ON r.id = m.room_id
                WHERE m.status IN ('pending', 'in_progress') AND (%(h)s::int IS NULL OR r.hotel_id = %(h)s)) AS open_maintenance,
             (SELECT COALESCE(SUM(p.amount), 0) FROM payments p
                JOIN reservations res ON res.id = p.reservation_id JOIN rooms r ON r.id = res.room_id
                WHERE p.status = 'paid' AND p.payment_date >= CURRENT_DATE - 30
                  AND (%(h)s::int IS NULL OR r.hotel_id = %(h)s)) AS revenue_30_days""",
        {"h": hotel_scope(user)},
    )
    if user["access_level"] == "maintenance":
        row.pop("revenue_30_days")  # money figures aren't needed for repair work
    return row


# --- Reservations ---
@router.get("/reservations")
def list_reservations(
    status: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: dict = Depends(desk),
):
    return fetch_all(
        """SELECT * FROM reservation_details
           WHERE (%(h)s::int IS NULL OR hotel_id = %(h)s)
             AND (%(status)s::text IS NULL OR status = %(status)s)
           ORDER BY check_in DESC, id DESC
           LIMIT %(limit)s OFFSET %(offset)s""",
        {"h": hotel_scope(user), "status": status, "limit": limit, "offset": offset},
    )


@router.post("/reservations/{reservation_id}/status")
def set_reservation_status(reservation_id: int, body: ReservationStatusIn, user: dict = Depends(desk)):
    allowed_from = {"checked_in": ("confirmed",), "checked_out": ("checked_in",), "no_show": ("pending", "confirmed")}
    with pool.connection() as conn:
        res = locked_reservation(conn, reservation_id, user)
        if res["status"] not in allowed_from[body.status]:
            raise HTTPException(409, f"Can't change a {res['status'].replace('_', ' ')} reservation to {body.status.replace('_', ' ')}.")
        if body.status in ("checked_in", "no_show") and res["check_in"] > date.today():
            raise HTTPException(409, "This stay hasn't started yet.")
        conn.execute("UPDATE reservations SET status = %s WHERE id = %s", (body.status, reservation_id))
        return conn.execute(DETAILS, (reservation_id,)).fetchone()


# --- Rooms ---
@router.get("/rooms")
def list_rooms(limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0), user: dict = Depends(any_staff)):
    return fetch_all(
        """SELECT r.*, h.name AS hotel_name FROM rooms r JOIN hotels h ON h.id = r.hotel_id
           WHERE (%(h)s::int IS NULL OR r.hotel_id = %(h)s)
           ORDER BY h.name, r.room_number
           LIMIT %(limit)s OFFSET %(offset)s""",
        {"h": hotel_scope(user), "limit": limit, "offset": offset},
    )


def own_room(room_id: int, user: dict) -> dict:
    room = fetch_one("SELECT * FROM rooms WHERE id = %s", (room_id,))
    if not room:
        raise HTTPException(404, "Room not found.")
    ensure_same_hotel(user, room["hotel_id"])
    return room


@router.post("/rooms", status_code=201)
def create_room(body: RoomIn, user: dict = Depends(managers)):
    hotel_id = hotel_scope(user) or body.hotel_id
    if hotel_id is None:
        raise HTTPException(422, "Choose a hotel for this room.")
    ensure_same_hotel(user, hotel_id)
    return fetch_one(
        """INSERT INTO rooms (hotel_id, room_number, room_type, price_per_night, status)
           VALUES (%s, %s, %s, %s, %s) RETURNING *""",
        (hotel_id, body.room_number, body.room_type, body.price_per_night, body.status),
    )


@router.patch("/rooms/{room_id}")
def update_room(room_id: int, body: RoomUpdate, user: dict = Depends(managers)):
    own_room(room_id, user)
    return update_row("rooms", room_id, body.model_dump(exclude_unset=True))


@router.delete("/rooms/{room_id}", status_code=204)
def delete_room(room_id: int, user: dict = Depends(managers)):
    own_room(room_id, user)
    fetch_one("DELETE FROM rooms WHERE id = %s RETURNING id", (room_id,))
    return Response(status_code=204)


# --- Maintenance ---
@router.get("/maintenance")
def list_maintenance(
    status: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: dict = Depends(any_staff),
):
    # Technicians see only the tasks assigned to them.
    technician = user["id"] if user["access_level"] == "maintenance" else None
    return fetch_all(
        """SELECT m.*, r.room_number, r.hotel_id, h.name AS hotel_name,
                  e.first_name || ' ' || e.last_name AS employee_name
           FROM room_maintenance m
           JOIN rooms r ON r.id = m.room_id
           JOIN hotels h ON h.id = r.hotel_id
           JOIN employees e ON e.id = m.employee_id
           WHERE (%(h)s::int IS NULL OR r.hotel_id = %(h)s)
             AND (%(tech)s::int IS NULL OR m.employee_id = %(tech)s)
             AND (%(status)s::text IS NULL OR m.status = %(status)s)
           ORDER BY m.created_at DESC
           LIMIT %(limit)s OFFSET %(offset)s""",
        {"h": hotel_scope(user), "tech": technician, "status": status, "limit": limit, "offset": offset},
    )


@router.post("/maintenance", status_code=201)
def create_maintenance(body: MaintenanceIn, user: dict = Depends(desk)):
    with pool.connection() as conn:
        room = conn.execute("SELECT hotel_id, status FROM rooms WHERE id = %s FOR UPDATE", (body.room_id,)).fetchone()
        if not room:
            raise HTTPException(404, "Room not found.")
        ensure_same_hotel(user, room["hotel_id"])
        employee = conn.execute("SELECT hotel_id FROM employees WHERE id = %s", (body.employee_id,)).fetchone()
        if not employee or employee["hotel_id"] != room["hotel_id"]:
            raise HTTPException(422, "Assign this task to an employee at the same hotel.")
        task = conn.execute(
            "INSERT INTO room_maintenance (room_id, employee_id, task_type) VALUES (%s, %s, %s) RETURNING *",
            (body.room_id, body.employee_id, body.task_type),
        ).fetchone()
        # Stop new bookings until the work is done. Existing bookings stay visible to staff.
        if room["status"] == "available":
            conn.execute("UPDATE rooms SET status = 'maintenance' WHERE id = %s", (body.room_id,))
        return task


@router.patch("/maintenance/{task_id}")
def update_maintenance(task_id: int, body: MaintenanceUpdate, user: dict = Depends(any_staff)):
    with pool.connection() as conn:
        task = conn.execute(
            """SELECT m.*, r.hotel_id FROM room_maintenance m JOIN rooms r ON r.id = m.room_id
               WHERE m.id = %s FOR UPDATE OF m, r""",
            (task_id,),
        ).fetchone()
        if not task:
            raise HTTPException(404, "Task not found.")
        ensure_same_hotel(user, task["hotel_id"])
        if user["access_level"] == "maintenance" and task["employee_id"] != user["id"]:
            raise HTTPException(403, "This task is assigned to someone else.")
        if task["status"] in ("completed", "cancelled"):
            raise HTTPException(409, "This task is already closed.")
        updated = conn.execute(
            """UPDATE room_maintenance
               SET status = %(status)s::varchar,
                   completed_at = CASE WHEN %(status)s::varchar = 'completed' THEN CURRENT_TIMESTAMP END
               WHERE id = %(id)s RETURNING *""",
            {"status": body.status, "id": task_id},
        ).fetchone()
        # When the last open task on a room closes, the room can be booked again.
        conn.execute(
            """UPDATE rooms SET status = 'available'
               WHERE id = %(room)s AND status = 'maintenance' AND NOT EXISTS (
                   SELECT 1 FROM room_maintenance
                   WHERE room_id = %(room)s AND status IN ('pending', 'in_progress'))""",
            {"room": task["room_id"]},
        )
        return updated


# --- Payments and guests ---
@router.get("/payments")
def list_payments(limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), user: dict = Depends(desk)):
    return fetch_all(
        """SELECT p.*, d.guest_name, d.hotel_name, d.room_number
           FROM payments p JOIN reservation_details d ON d.id = p.reservation_id
           WHERE (%(h)s::int IS NULL OR d.hotel_id = %(h)s)
           ORDER BY p.payment_date DESC, p.id DESC
           LIMIT %(limit)s OFFSET %(offset)s""",
        {"h": hotel_scope(user), "limit": limit, "offset": offset},
    )


@router.get("/guests")
def list_guests(limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), user: dict = Depends(desk)):
    # Only guests who have booked at this employee's hotel. Password hashes are never selected.
    return fetch_all(
        """SELECT g.id, g.name, g.email, g.phone, COUNT(d.id) AS stays
           FROM guests g
           LEFT JOIN reservation_details d ON d.guest_id = g.id
                AND (%(h)s::int IS NULL OR d.hotel_id = %(h)s)
           GROUP BY g.id
           HAVING %(h)s::int IS NULL OR COUNT(d.id) > 0
           ORDER BY g.name
           LIMIT %(limit)s OFFSET %(offset)s""",
        {"h": hotel_scope(user), "limit": limit, "offset": offset},
    )


# --- Employees ---
EMPLOYEE_COLUMNS = """e.id, e.hotel_id, e.role_id, e.first_name, e.last_name, e.phone, e.email,
                      e.hire_date, e.salary, r.role_name, r.access_level, h.name AS hotel_name"""
EMPLOYEE_FROM = "FROM employees e JOIN roles r ON r.id = e.role_id JOIN hotels h ON h.id = e.hotel_id"


def role_level(role_id: int) -> str:
    role = fetch_one("SELECT access_level FROM roles WHERE id = %s", (role_id,))
    if not role:
        raise HTTPException(422, "That role doesn't exist.")
    return role["access_level"]


def check_can_manage(user: dict, level: str) -> None:
    """Managers can't create or edit managers and admins, so they can't raise their own access."""
    if user["access_level"] != "admin" and level in ("admin", "manager"):
        raise HTTPException(403, "Only an admin can manage manager and admin accounts.")


def employee_row(employee_id: int) -> dict:
    return fetch_one(f"SELECT {EMPLOYEE_COLUMNS} {EMPLOYEE_FROM} WHERE e.id = %s", (employee_id,))


def managed_employee(employee_id: int, user: dict) -> dict:
    target = employee_row(employee_id)
    if not target:
        raise HTTPException(404, "Employee not found.")
    ensure_same_hotel(user, target["hotel_id"])
    check_can_manage(user, target["access_level"])
    return target


@router.get("/roles")
def list_roles(user: dict = Depends(managers)):
    return fetch_all("SELECT id, role_name, description, access_level FROM roles ORDER BY role_name")


@router.get("/employees")
def list_employees(limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0), user: dict = Depends(desk)):
    # The desk needs names for assigning tasks, but salaries are for managers only.
    rows = fetch_all(
        f"""SELECT {EMPLOYEE_COLUMNS} {EMPLOYEE_FROM}
            WHERE (%(h)s::int IS NULL OR e.hotel_id = %(h)s)
            ORDER BY h.name, e.last_name, e.first_name
            LIMIT %(limit)s OFFSET %(offset)s""",
        {"h": hotel_scope(user), "limit": limit, "offset": offset},
    )
    if user["access_level"] == "front_desk":
        for row in rows:
            row.pop("salary")
    return rows


@router.post("/employees", status_code=201)
def create_employee(body: EmployeeIn, user: dict = Depends(managers)):
    check_can_manage(user, role_level(body.role_id))
    hotel_id = hotel_scope(user) or body.hotel_id
    if hotel_id is None:
        raise HTTPException(422, "Choose a hotel for this employee.")
    ensure_same_hotel(user, hotel_id)
    email = body.email.lower()
    if fetch_one("SELECT 1 AS found FROM guests WHERE LOWER(email) = %s", (email,)):
        raise HTTPException(409, "This email is already registered.")
    new = fetch_one(
        """INSERT INTO employees (hotel_id, role_id, first_name, last_name, phone, email, hire_date, salary, password_hash)
           VALUES (%s, %s, %s, %s, %s, %s, COALESCE(%s, CURRENT_DATE), %s, %s) RETURNING id""",
        (hotel_id, body.role_id, body.first_name, body.last_name, body.phone, email,
         body.hire_date, body.salary, hash_password(body.password)),
    )
    return employee_row(new["id"])


@router.patch("/employees/{employee_id}")
def update_employee(employee_id: int, body: EmployeeUpdate, user: dict = Depends(managers)):
    managed_employee(employee_id, user)
    data = body.model_dump(exclude_unset=True)
    if "role_id" in data:
        check_can_manage(user, role_level(data["role_id"]))
    if "hotel_id" in data:
        ensure_same_hotel(user, data["hotel_id"])
    if "email" in data:
        data["email"] = data["email"].lower()
    if "password" in data:
        data["password_hash"] = hash_password(data.pop("password"))
    update_row("employees", employee_id, data)
    return employee_row(employee_id)


@router.delete("/employees/{employee_id}", status_code=204)
def delete_employee(employee_id: int, user: dict = Depends(managers)):
    if employee_id == user["id"]:
        raise HTTPException(409, "You can't delete your own account.")
    managed_employee(employee_id, user)
    fetch_one("DELETE FROM employees WHERE id = %s RETURNING id", (employee_id,))
    return Response(status_code=204)
