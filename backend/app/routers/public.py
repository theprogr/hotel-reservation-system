"""Pages anyone can see without logging in."""
from datetime import date
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from ..db import fetch_all, fetch_one
from ..schemas import RoomType, validate_stay

router = APIRouter(tags=["public"])


@router.get("/cities")
def cities():
    return [r["city"] for r in fetch_all("SELECT DISTINCT city FROM hotels ORDER BY city")]


@router.get("/hotels")
def hotels(city: Optional[str] = None):
    return fetch_all(
        """SELECT h.id, h.name, h.address, h.city, h.phone, COUNT(r.id) AS rooms
           FROM hotels h LEFT JOIN rooms r ON r.hotel_id = h.id
           WHERE (%(city)s::text IS NULL OR LOWER(h.city) = LOWER(%(city)s))
           GROUP BY h.id
           ORDER BY h.city, h.name""",
        {"city": city},
    )


@router.get("/hotels/{hotel_id}")
def hotel(hotel_id: int):
    row = fetch_one("SELECT id, name, address, city, phone FROM hotels WHERE id = %s", (hotel_id,))
    if not row:
        raise HTTPException(404, "Hotel not found.")
    return row


@router.get("/rooms/search")
def search_rooms(
    check_in: date,
    check_out: date,
    city: Optional[str] = None,
    hotel_id: Optional[int] = None,
    room_type: Optional[RoomType] = None,
    max_price: Optional[float] = Query(None, ge=0),
    limit: int = Query(24, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """Rooms free for the whole stay: open for booking, with no active overlapping reservation."""
    try:
        validate_stay(check_in, check_out)
    except ValueError as e:
        raise HTTPException(422, str(e))
    rows = fetch_all(
        """SELECT r.id, r.room_number, r.room_type, r.price_per_night,
                  h.id AS hotel_id, h.name AS hotel_name, h.city, h.address,
                  (%(check_out)s::date - %(check_in)s::date) * r.price_per_night AS total_price,
                  COUNT(*) OVER () AS total_results
           FROM rooms r
           JOIN hotels h ON h.id = r.hotel_id
           WHERE r.status = 'available'
             AND (%(city)s::text IS NULL OR LOWER(h.city) = LOWER(%(city)s))
             AND (%(hotel_id)s::int IS NULL OR h.id = %(hotel_id)s)
             AND (%(room_type)s::text IS NULL OR r.room_type = %(room_type)s)
             AND (%(max_price)s::numeric IS NULL OR r.price_per_night <= %(max_price)s)
             AND NOT EXISTS (
                 SELECT 1 FROM reservations res
                 WHERE res.room_id = r.id
                   AND res.status IN ('pending', 'confirmed', 'checked_in')
                   AND daterange(res.check_in, res.check_out, '[)')
                       && daterange(%(check_in)s::date, %(check_out)s::date, '[)')
             )
           ORDER BY r.price_per_night, h.name, r.room_number
           LIMIT %(limit)s OFFSET %(offset)s""",
        {
            "check_in": check_in, "check_out": check_out, "city": city, "hotel_id": hotel_id,
            "room_type": room_type, "max_price": max_price, "limit": limit, "offset": offset,
        },
    )
    total = rows[0]["total_results"] if rows else 0
    return {"total": total, "rooms": [{k: v for k, v in r.items() if k != "total_results"} for r in rows]}
