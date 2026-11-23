"""Pages anyone can see without logging in. Availability always comes from the
find_available_rooms() PL/pgSQL function, so every search uses the same rules."""
from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query

from ..db import fetch_all, fetch_one
from ..schemas import RoomType, validate_stay

router = APIRouter(tags=["public"])

MAX_GUESTS = 8


def check_stay(check_in: date, check_out: date) -> None:
    try:
        validate_stay(check_in, check_out)
    except ValueError as e:
        raise HTTPException(422, str(e))


@router.get("/cities")
def cities():
    return [r["city"] for r in fetch_all("SELECT DISTINCT city FROM hotels ORDER BY city")]


@router.get("/destinations")
def destinations():
    """Every city, with its number of hotels and its cheapest nightly price."""
    return fetch_all(
        """SELECT h.city,
                  COUNT(DISTINCT h.id)    AS hotels,
                  MIN(r.price_per_night)  AS from_price,
                  MAX(h.stars)            AS top_stars
           FROM hotels h JOIN rooms r ON r.hotel_id = h.id
           GROUP BY h.city
           ORDER BY hotels DESC, h.city"""
    )


@router.get("/hotels")
def hotels(city: Optional[str] = None, limit: int = Query(100, ge=1, le=100)):
    """Hotels with their stars, room count and starting price, best-rated first."""
    return fetch_all(
        """SELECT h.id, h.name, h.address, h.city, h.phone, h.stars, h.description,
                  COUNT(r.id) AS rooms, MIN(r.price_per_night) AS from_price
           FROM hotels h LEFT JOIN rooms r ON r.hotel_id = h.id
           WHERE (%(city)s::text IS NULL OR LOWER(h.city) = LOWER(%(city)s))
           GROUP BY h.id
           ORDER BY h.stars DESC, from_price, h.name
           LIMIT %(limit)s""",
        {"city": city, "limit": limit},
    )


@router.get("/hotels/search")
def search_hotels(
    check_in: date,
    check_out: date,
    guests: int = Query(2, ge=1, le=MAX_GUESTS),
    city: Optional[str] = None,
    stars: Optional[str] = Query(None, pattern=r"^[1-5](,[1-5])*$", description="e.g. 4,5"),
    room_type: Optional[RoomType] = None,
    max_price: Optional[float] = Query(None, ge=0),
    sort: Literal["recommended", "price_low", "price_high", "stars"] = "recommended",
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
):
    """Hotels with at least one room free for the whole stay, with the cheapest matching room."""
    check_stay(check_in, check_out)
    order = {
        "recommended": "h.stars DESC, from_price ASC, h.name",
        "price_low": "from_price ASC, h.stars DESC, h.name",
        "price_high": "from_price DESC, h.name",
        "stars": "h.stars DESC, h.name",
    }[sort]
    star_list = [int(s) for s in stars.split(",")] if stars else None
    rows = fetch_all(
        f"""WITH free AS (
                SELECT * FROM find_available_rooms(%(check_in)s, %(check_out)s, %(guests)s, %(city)s)
                WHERE (%(room_type)s::text IS NULL OR room_type = %(room_type)s)
                  AND (%(max_price)s::numeric IS NULL OR price_per_night <= %(max_price)s)
            )
            SELECT h.id, h.name, h.city, h.address, h.stars, h.description,
                   MIN(f.price_per_night) AS from_price,
                   MIN(f.total_price)     AS from_total,
                   COUNT(*)               AS free_rooms,
                   ARRAY_AGG(DISTINCT f.room_type) AS room_types,
                   COUNT(*) OVER ()       AS total_results
            FROM free f JOIN hotels h ON h.id = f.hotel_id
            WHERE (%(stars)s::int[] IS NULL OR h.stars = ANY(%(stars)s))
            GROUP BY h.id
            ORDER BY {order}
            LIMIT %(limit)s OFFSET %(offset)s""",
        {"check_in": check_in, "check_out": check_out, "guests": guests, "city": city,
         "room_type": room_type, "max_price": max_price, "stars": star_list,
         "limit": limit, "offset": offset},
    )
    total = rows[0]["total_results"] if rows else 0
    return {"total": total, "nights": (check_out - check_in).days,
            "hotels": [{k: v for k, v in r.items() if k != "total_results"} for r in rows]}


@router.get("/hotels/{hotel_id}")
def hotel(hotel_id: int):
    row = fetch_one(
        """SELECT h.id, h.name, h.address, h.city, h.phone, h.stars, h.description,
                  COUNT(r.id) AS rooms, MIN(r.price_per_night) AS from_price
           FROM hotels h LEFT JOIN rooms r ON r.hotel_id = h.id
           WHERE h.id = %s GROUP BY h.id""",
        (hotel_id,),
    )
    if not row:
        raise HTTPException(404, "Hotel not found.")
    row["room_types"] = fetch_all(
        """SELECT room_type, MAX(capacity) AS sleeps, MIN(price_per_night) AS from_price, COUNT(*) AS rooms
           FROM rooms WHERE hotel_id = %s GROUP BY room_type ORDER BY from_price""",
        (hotel_id,),
    )
    return row


@router.get("/hotels/{hotel_id}/availability")
def hotel_availability(
    hotel_id: int,
    check_in: date,
    check_out: date,
    guests: int = Query(2, ge=1, le=MAX_GUESTS),
):
    """Free rooms at one hotel for a stay, cheapest first."""
    check_stay(check_in, check_out)
    if not fetch_one("SELECT 1 AS found FROM hotels WHERE id = %s", (hotel_id,)):
        raise HTTPException(404, "Hotel not found.")
    return fetch_all(
        """SELECT room_id AS id, room_number, room_type, capacity, price_per_night, total_price
           FROM find_available_rooms(%s, %s, %s, NULL, %s)
           ORDER BY price_per_night, room_number""",
        (check_in, check_out, guests, hotel_id),
    )


@router.get("/rooms/search")
def search_rooms(
    check_in: date,
    check_out: date,
    city: Optional[str] = None,
    hotel_id: Optional[int] = None,
    room_type: Optional[RoomType] = None,
    max_price: Optional[float] = Query(None, ge=0),
    guests: int = Query(1, ge=1, le=MAX_GUESTS),
    limit: int = Query(24, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """Individual free rooms across hotels, cheapest first."""
    check_stay(check_in, check_out)
    rows = fetch_all(
        """SELECT f.room_id AS id, f.room_number, f.room_type, f.capacity, f.price_per_night, f.total_price,
                  h.id AS hotel_id, h.name AS hotel_name, h.city, h.address, h.stars,
                  COUNT(*) OVER () AS total_results
           FROM find_available_rooms(%(check_in)s, %(check_out)s, %(guests)s, %(city)s, %(hotel_id)s) f
           JOIN hotels h ON h.id = f.hotel_id
           WHERE (%(room_type)s::text IS NULL OR f.room_type = %(room_type)s)
             AND (%(max_price)s::numeric IS NULL OR f.price_per_night <= %(max_price)s)
           ORDER BY f.price_per_night, h.name, f.room_number
           LIMIT %(limit)s OFFSET %(offset)s""",
        {"check_in": check_in, "check_out": check_out, "city": city, "hotel_id": hotel_id,
         "room_type": room_type, "max_price": max_price, "guests": guests,
         "limit": limit, "offset": offset},
    )
    total = rows[0]["total_results"] if rows else 0
    return {"total": total, "rooms": [{k: v for k, v in r.items() if k != "total_results"} for r in rows]}
