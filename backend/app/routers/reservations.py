"""Booking, paying for and cancelling stays."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException

from ..db import fetch_all, fetch_one, pool
from ..schemas import PaymentIn, ReservationIn
from ..security import current_user, hotel_scope, require_guest

router = APIRouter(prefix="/reservations", tags=["reservations"])

DETAILS = "SELECT * FROM reservation_details WHERE id = %s"


def locked_reservation(conn, reservation_id: int, user: dict) -> dict:
    """Lock the row so two simultaneous actions on one booking run one after the other.
    Guests reach only their own bookings; desk staff and managers only their own hotel's."""
    res = conn.execute(
        """SELECT res.*, r.hotel_id,
                  (res.check_out - res.check_in) * r.price_per_night AS total_price
           FROM reservations res JOIN rooms r ON r.id = res.room_id
           WHERE res.id = %s
           FOR UPDATE OF res""",
        (reservation_id,),
    ).fetchone()
    not_found = HTTPException(404, "Reservation not found.")
    if not res:
        raise not_found
    if user["kind"] == "guest":
        if res["guest_id"] != user["id"]:
            raise not_found  # 404, so guests can't probe for other people's bookings
    else:
        if user["access_level"] not in ("admin", "manager", "front_desk"):
            raise HTTPException(403, "Your role doesn't allow this.")
        scope = hotel_scope(user)
        if scope is not None and scope != res["hotel_id"]:
            raise not_found
    return res


@router.post("", status_code=201)
def create_reservation(body: ReservationIn, user: dict = Depends(require_guest)):
    with pool.connection() as conn:
        # Bookings for the same room wait in line here, one at a time. Without this lock,
        # simultaneous inserts can deadlock while checking the exclusion constraint.
        # NO KEY UPDATE still lets other tables reference the room, so unrelated work isn't blocked.
        room = conn.execute("SELECT status FROM rooms WHERE id = %s FOR NO KEY UPDATE", (body.room_id,)).fetchone()
        if not room:
            raise HTTPException(404, "Room not found.")
        if room["status"] != "available":
            raise HTTPException(409, "This room isn't open for booking right now.")
        # The no_double_booking constraint is the real guard. If this overlaps another
        # booking, Postgres raises an error, and main.py turns it into a clear 409.
        new = conn.execute(
            """INSERT INTO reservations (guest_id, room_id, check_in, check_out)
               VALUES (%s, %s, %s, %s) RETURNING id""",
            (user["id"], body.room_id, body.check_in, body.check_out),
        ).fetchone()
        return conn.execute(DETAILS, (new["id"],)).fetchone()


@router.get("/mine")
def my_reservations(user: dict = Depends(require_guest)):
    return fetch_all(
        "SELECT * FROM reservation_details WHERE guest_id = %s ORDER BY check_in DESC, id DESC",
        (user["id"],),
    )


@router.post("/{reservation_id}/pay")
def pay(reservation_id: int, body: PaymentIn, user: dict = Depends(current_user)):
    """Simulated payment. The amount comes from the database, never from the browser."""
    with pool.connection() as conn:
        res = locked_reservation(conn, reservation_id, user)
        if res["status"] != "pending":
            raise HTTPException(409, f"A {res['status'].replace('_', ' ')} reservation can't be paid.")
        conn.execute(
            "INSERT INTO payments (reservation_id, amount, payment_method) VALUES (%s, %s, %s)",
            (reservation_id, res["total_price"], body.payment_method),
        )
        conn.execute("UPDATE reservations SET status = 'confirmed' WHERE id = %s", (reservation_id,))
        return conn.execute(DETAILS, (reservation_id,)).fetchone()


@router.post("/{reservation_id}/cancel")
def cancel(reservation_id: int, user: dict = Depends(current_user)):
    with pool.connection() as conn:
        res = locked_reservation(conn, reservation_id, user)
        if res["status"] not in ("pending", "confirmed"):
            raise HTTPException(409, f"A {res['status'].replace('_', ' ')} reservation can't be cancelled.")
        if user["kind"] == "guest" and res["check_in"] <= date.today():
            raise HTTPException(409, "Your stay has started. Please contact the front desk.")
        conn.execute("UPDATE reservations SET status = 'cancelled' WHERE id = %s", (reservation_id,))
        conn.execute(
            "UPDATE payments SET status = 'refunded' WHERE reservation_id = %s AND status = 'paid'",
            (reservation_id,),
        )
        return conn.execute(DETAILS, (reservation_id,)).fetchone()
