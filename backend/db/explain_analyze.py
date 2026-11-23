"""Show what the reservations_guest_idx index does, using EXPLAIN ANALYZE before and after.

With only ~170 sample reservations, Postgres reads the whole table either way, because that
is faster for tiny tables. So this script adds 30,000 extra reservations inside a transaction,
compares the plans, and then ROLLS EVERYTHING BACK. Nothing in the database changes.

Usage (from the backend folder):
    .venv/bin/python db/explain_analyze.py
Output is printed and saved to db/explain_analyze_output.txt.
"""
import os
from datetime import datetime
from pathlib import Path

import psycopg
from dotenv import load_dotenv

HERE = Path(__file__).resolve().parent
load_dotenv(HERE.parent / ".env")

# "Show all bookings for one guest": what the My bookings page needs.
QUERY = """
SELECT id, room_id, check_in, check_out, status
  FROM reservations
 WHERE guest_id = %s
 ORDER BY check_in DESC
"""

# Each room gets 100 back-to-back 2-night stays starting about 3 years from now,
# so they never overlap each other or real bookings.
BULK_INSERT = """
INSERT INTO reservations (guest_id, room_id, check_in, check_out, num_guests, status)
SELECT g.id, r.id, d.day, d.day + 2, 1, 'confirmed'
  FROM rooms r
 CROSS JOIN LATERAL (
       SELECT CURRENT_DATE + 1000 + n * 2 AS day, n
         FROM generate_series(0, 99) AS n
 ) d
  JOIN LATERAL (
       SELECT id FROM guests ORDER BY id OFFSET ((r.id * 7 + d.n * 13) % 100) LIMIT 1
 ) g ON TRUE
 WHERE r.status = 'available'
"""


def plan(cur, guest_id):
    rows = cur.execute("EXPLAIN (ANALYZE, BUFFERS) " + QUERY, (guest_id,)).fetchall()
    return "\n".join(r[0] for r in rows)


def main():
    lines = [f"EXPLAIN ANALYZE for reservations_guest_idx, run {datetime.now():%Y-%m-%d %H:%M}", ""]
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        with conn.transaction(force_rollback=True):  # everything below is undone at the end
            cur = conn.cursor()
            cur.execute(BULK_INSERT)
            total = cur.execute("SELECT COUNT(*) FROM reservations").fetchone()[0]
            guest_id = cur.execute(
                "SELECT guest_id FROM reservations GROUP BY guest_id ORDER BY COUNT(*) DESC LIMIT 1"
            ).fetchone()[0]
            matches = cur.execute("SELECT COUNT(*) FROM reservations WHERE guest_id = %s", (guest_id,)).fetchone()[0]
            lines += [f"Table size for the test: {total} reservations. Guest {guest_id} has {matches} of them.",
                      "Query:" + QUERY.replace("%s", str(guest_id)), ""]

            cur.execute("DROP INDEX reservations_guest_idx")
            cur.execute("ANALYZE reservations")
            lines += ["BEFORE: without the index", "-" * 60, plan(cur, guest_id), ""]

            cur.execute("CREATE INDEX reservations_guest_idx ON reservations (guest_id)")
            cur.execute("ANALYZE reservations")
            lines += ["AFTER: with CREATE INDEX reservations_guest_idx ON reservations (guest_id)", "-" * 60,
                      plan(cur, guest_id), ""]
        lines.append("All test rows were rolled back. The database is unchanged.")

    output = "\n".join(lines)
    print(output)
    (HERE / "explain_analyze_output.txt").write_text(output + "\n")


if __name__ == "__main__":
    main()
