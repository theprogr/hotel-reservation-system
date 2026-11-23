-- Key reporting queries. The staff "Reports" tab runs these exact queries.
--
-- Each one is limited to one hotel through %(hotel_id)s, or covers every hotel when it is NULL.
-- To run one by hand in psql or pgAdmin, replace %(hotel_id)s with NULL or a hotel id.
-- Each query starts with a "-- name:" line, which the API uses to find it.


-- name: revenue_by_hotel
-- Revenue per hotel per month over the last 6 months, from paid payments only.
-- Joins 4 tables and aggregates with GROUP BY.
SELECT h.name                                  AS hotel,
       h.city,
       TO_CHAR(DATE_TRUNC('month', p.payment_date), 'YYYY-MM') AS month,
       COUNT(*)                                AS payments,
       SUM(p.amount)                           AS revenue
  FROM payments p
  JOIN reservations res ON res.id = p.reservation_id
  JOIN rooms r          ON r.id   = res.room_id
  JOIN hotels h         ON h.id   = r.hotel_id
 WHERE p.status = 'paid'
   AND p.payment_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'
   AND (%(hotel_id)s::int IS NULL OR h.id = %(hotel_id)s)
 GROUP BY h.id, h.name, h.city, DATE_TRUNC('month', p.payment_date)
 ORDER BY month DESC, revenue DESC;


-- name: occupancy_ranking
-- Occupancy over the last 30 days per hotel, ranked within each city.
-- Calls the occupancy_rate() PL/pgSQL function and uses a RANK() window function.
SELECT h.name                                            AS hotel,
       h.city,
       h.stars,
       occupancy_rate(h.id, CURRENT_DATE - 30, CURRENT_DATE) AS occupancy_percent,
       RANK() OVER (
           PARTITION BY h.city
           ORDER BY occupancy_rate(h.id, CURRENT_DATE - 30, CURRENT_DATE) DESC
       )                                                 AS rank_in_city
  FROM hotels h
 WHERE (%(hotel_id)s::int IS NULL OR h.id = %(hotel_id)s)
 ORDER BY occupancy_percent DESC, h.name;


-- name: top_guests
-- Guests who have stayed at least twice, ranked by how much they have spent.
-- Joins 4 tables, aggregates, and filters groups with HAVING.
SELECT g.name                                  AS guest,
       g.email,
       COUNT(DISTINCT res.id)                  AS stays,
       SUM(res.check_out - res.check_in)       AS nights,
       COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'paid'), 0) AS total_spent
  FROM guests g
  JOIN reservations res ON res.guest_id = g.id
  JOIN rooms r          ON r.id = res.room_id
  LEFT JOIN payments p  ON p.reservation_id = res.id
 WHERE res.status IN ('confirmed', 'checked_in', 'checked_out')
   AND (%(hotel_id)s::int IS NULL OR r.hotel_id = %(hotel_id)s)
 GROUP BY g.id, g.name, g.email
HAVING COUNT(DISTINCT res.id) >= 2
 ORDER BY total_spent DESC, stays DESC
 LIMIT 20;


-- name: room_type_performance
-- How each room type performs: bookings, average stay, average price and cancellation rate.
SELECT r.room_type,
       COUNT(res.id)                                             AS bookings,
       ROUND(AVG(res.check_out - res.check_in), 1)               AS avg_nights,
       ROUND(AVG(r.price_per_night), 0)                          AS avg_price_per_night,
       ROUND(100.0 * COUNT(*) FILTER (WHERE res.status = 'cancelled')
             / NULLIF(COUNT(res.id), 0), 1)                      AS cancellation_percent
  FROM rooms r
  LEFT JOIN reservations res ON res.room_id = r.id
 WHERE (%(hotel_id)s::int IS NULL OR r.hotel_id = %(hotel_id)s)
 GROUP BY r.room_type
 ORDER BY bookings DESC;


-- name: maintenance_workload
-- Work per technician: open tasks, completed tasks, and average hours to finish one.
SELECT e.first_name || ' ' || e.last_name                       AS technician,
       h.name                                                   AS hotel,
       COUNT(*) FILTER (WHERE m.status IN ('pending', 'in_progress')) AS open_tasks,
       COUNT(*) FILTER (WHERE m.status = 'completed')           AS completed_tasks,
       ROUND(AVG(EXTRACT(EPOCH FROM (m.completed_at - m.created_at)) / 3600)
             FILTER (WHERE m.status = 'completed'), 1)          AS avg_hours_to_complete
  FROM employees e
  JOIN hotels h           ON h.id = e.hotel_id
  JOIN room_maintenance m ON m.employee_id = e.id
 WHERE (%(hotel_id)s::int IS NULL OR e.hotel_id = %(hotel_id)s)
 GROUP BY e.id, e.first_name, e.last_name, h.name
 ORDER BY open_tasks DESC, completed_tasks DESC
 LIMIT 30;
