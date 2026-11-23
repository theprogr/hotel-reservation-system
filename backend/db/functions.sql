-- PL/pgSQL functions. The API calls these instead of repeating the logic in Python.

-- 1. Price of a stay: nights x the room's nightly price.
--    Used when a guest pays, so the amount always comes from the database.
--    Example: SELECT calculate_reservation_total(1);
CREATE OR REPLACE FUNCTION calculate_reservation_total(p_reservation_id INTEGER)
RETURNS NUMERIC(10, 2)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_total NUMERIC(10, 2);
BEGIN
    SELECT (res.check_out - res.check_in) * r.price_per_night
      INTO v_total
      FROM reservations res
      JOIN rooms r ON r.id = res.room_id
     WHERE res.id = p_reservation_id;

    IF v_total IS NULL THEN
        RAISE EXCEPTION 'Reservation % does not exist', p_reservation_id;
    END IF;
    RETURN v_total;
END;
$$;


-- 2. Rooms that are free for a whole stay and big enough for the group.
--    Optional filters: city and one hotel. Used by every search on the website.
--    Example: SELECT * FROM find_available_rooms('2026-12-20', '2026-12-23', 2, 'Almaty');
CREATE OR REPLACE FUNCTION find_available_rooms(
    p_check_in  DATE,
    p_check_out DATE,
    p_guests    INTEGER DEFAULT 1,
    p_city      TEXT DEFAULT NULL,
    p_hotel_id  INTEGER DEFAULT NULL
)
RETURNS TABLE (
    room_id         INTEGER,
    hotel_id        INTEGER,
    room_number     INTEGER,
    room_type       VARCHAR,
    capacity        SMALLINT,
    price_per_night NUMERIC,
    total_price     NUMERIC
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    IF p_check_out <= p_check_in THEN
        RAISE EXCEPTION 'Check-out must be after check-in';
    END IF;
    IF p_guests < 1 THEN
        RAISE EXCEPTION 'At least one guest is required';
    END IF;

    RETURN QUERY
    SELECT r.id, r.hotel_id, r.room_number, r.room_type, r.capacity, r.price_per_night,
           (p_check_out - p_check_in) * r.price_per_night
      FROM rooms r
      JOIN hotels h ON h.id = r.hotel_id
     WHERE r.status = 'available'
       AND r.capacity >= p_guests
       AND (p_city IS NULL OR LOWER(h.city) = LOWER(p_city))
       AND (p_hotel_id IS NULL OR r.hotel_id = p_hotel_id)
       AND NOT EXISTS (
           SELECT 1
             FROM reservations res
            WHERE res.room_id = r.id
              AND res.status IN ('pending', 'confirmed', 'checked_in')
              AND daterange(res.check_in, res.check_out, '[)')
                  && daterange(p_check_in, p_check_out, '[)')
       );
END;
$$;


-- 3. Share of room-nights booked at a hotel over a period, as a percentage.
--    Used by the staff occupancy report.
--    Example: SELECT occupancy_rate(1, '2026-10-01', '2026-11-01');
CREATE OR REPLACE FUNCTION occupancy_rate(p_hotel_id INTEGER, p_from DATE, p_to DATE)
RETURNS NUMERIC(5, 1)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_room_nights   INTEGER;
    v_booked_nights INTEGER;
BEGIN
    IF p_to <= p_from THEN
        RAISE EXCEPTION 'The end date must be after the start date';
    END IF;

    SELECT COUNT(*) * (p_to - p_from) INTO v_room_nights
      FROM rooms WHERE hotel_id = p_hotel_id;
    IF v_room_nights = 0 THEN
        RETURN 0;
    END IF;

    -- Count only the nights of each stay that fall inside the period.
    SELECT COALESCE(SUM(LEAST(res.check_out, p_to) - GREATEST(res.check_in, p_from)), 0)
      INTO v_booked_nights
      FROM reservations res
      JOIN rooms r ON r.id = res.room_id
     WHERE r.hotel_id = p_hotel_id
       AND res.status IN ('confirmed', 'checked_in', 'checked_out')
       AND res.check_in < p_to
       AND res.check_out > p_from;

    RETURN ROUND(100.0 * v_booked_nights / v_room_nights, 1);
END;
$$;
