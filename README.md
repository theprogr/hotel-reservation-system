# Qonaq: Hotel Reservation System

A full-stack hotel booking app for Kazakhstan. Guests search hotels by city, dates and group size, compare them, and book and pay. Staff manage reservations, rooms, maintenance and employees, and see reports, with access limited by role and hotel.

**Live site:** https://hotel-reservation-kz.vercel.app

**Stack:** PostgreSQL (Neon) · FastAPI (Python) with hand-written SQL · React (Vite) · hosted on Vercel

**Photos:** city photos are real photos of each city, and room photos are examples from other hotels, since the hotels here are sample data. All come from Wikimedia Commons under free licenses, credited on the site's [Photo credits](https://hotel-reservation-kz.vercel.app/credits) page and listed in [photos.js](frontend/src/photos.js). If a photo can't load, a drawn illustration appears instead.

## The main feature: no double bookings

Two guests can click "Book" on the same room at the same moment. Checking availability first and then saving isn't enough, because both requests can pass the check before either one saves.

This project enforces the rule in the database, with an exclusion constraint on room and date range:

```sql
CONSTRAINT no_double_booking EXCLUDE USING gist (
    room_id WITH =,
    daterange(check_in, check_out, '[)') WITH &&
) WHERE (status IN ('pending', 'confirmed', 'checked_in'))
```

- `[)` means a guest can check in on the day the previous guest checks out.
- Cancelled bookings don't count, so a cancelled room can be booked again.

A test sends 20 simultaneous bookings for one room and requires exactly one success. The first version of this test found a real problem: the constraint itself could deadlock under simultaneous inserts. The fix was to lock the room row first (`SELECT ... FOR NO KEY UPDATE`), so bookings for the same room queue up, while the constraint remains the final guarantee.

## Database

8 tables: `hotels`, `roles`, `guests`, `rooms`, `employees`, `reservations`, `room_maintenance`, `payments`. See [schema.sql](backend/db/schema.sql).

```
hotels ──< rooms ──< reservations >── guests
  │          │            │
  │          │            └──< payments
  │          └──< room_maintenance >──┐
  └──< employees >── roles            │
          └───────────────────────────┘
```

Other rules enforced by the database:

- Check-out must be after check-in, and prices can't be negative
- Room numbers are unique within a hotel, and emails are unique regardless of capital letters
- Status columns accept only known values
- A reservation can have only one paid payment, even if "Pay" is clicked twice
- Foreign keys are indexed, and the `reservation_details` view gives the screens one readable row per booking

### Where each part lives

| File | What's in it |
|---|---|
| [schema.sql](backend/db/schema.sql) | Tables, keys, CHECK constraints, indexes, the `reservation_details` view |
| [functions.sql](backend/db/functions.sql) | PL/pgSQL functions: `calculate_reservation_total`, `find_available_rooms`, `occupancy_rate` |
| [triggers.sql](backend/db/triggers.sql) | 6 triggers for business rules (below) |
| [queries.sql](backend/db/queries.sql) | 5 report queries with joins, aggregation, `HAVING` and a window function, shown in the staff Reports tab |
| [explain_analyze.py](backend/db/explain_analyze.py) | EXPLAIN ANALYZE before and after `reservations_guest_idx`; output in [explain_analyze_output.txt](backend/db/explain_analyze_output.txt) |
| [seed.py](backend/db/seed.py) | Loads the files above and adds 50+ rows of sample data per table |

### Triggers

| Trigger | Business rule |
|---|---|
| `trg_reservation_rules` | A room can only be booked while it's open, and never for more guests than it sleeps |
| `trg_validate_payment` | A payment must equal the stay's price, and cancelled or no-show bookings can't be paid |
| `trg_confirm_paid_reservation` | Paying a pending booking confirms it |
| `trg_refund_cancelled_reservation` | Cancelling a booking refunds its payment |
| `trg_maintenance_completed_at` | Completing a task records when it was finished |
| `trg_room_maintenance_status` | A room with unfinished maintenance is closed to bookings, and reopens when the work is done |

The API relies on these rules instead of repeating them in Python, so they also apply to any data written directly in SQL.

## Roles

| Access level | Can do | Scope |
|---|---|---|
| Guest | Search, book, pay, cancel own bookings | Own bookings |
| Maintenance | See and update assigned tasks | Own tasks |
| Front desk | Reservations, check-in and check-out, payments, create maintenance tasks | Own hotel |
| Manager | All of the above, plus rooms and non-manager employees | Own hotel |
| Admin | Everything, plus hotels and roles | All hotels |

Passwords are hashed with bcrypt, and login uses signed tokens (JWT). Payment amounts are calculated on the server, never taken from the browser.

Payments are **simulated**: no money moves and no card details are collected.

## Run it locally

You need PostgreSQL, Python 3.13 and Node.js.

**1. Create the database** (in pgAdmin or psql):

```sql
CREATE DATABASE hotel_v2;
```

**2. Set up the backend:**

```bash
cd backend
python3.13 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
cp .env.example .env
```

Edit `.env` with your database password and a random `JWT_SECRET`, then:

```bash
.venv/bin/python db/seed.py
.venv/bin/python -m uvicorn app.main:app --port 8000
```

To erase `hotel_v2` and rebuild the sample data, run `.venv/bin/python db/seed.py --reset`.

API docs are at http://localhost:8000/docs

**3. Start the frontend** in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

### Sample accounts

These passwords work only on your local copy; the live site's accounts use a different, private password. All use the local password `Demo1234!`.

| Email | Role |
|---|---|
| guest@hotel.test | Guest |
| reception@hotel.test | Front desk |
| tech@hotel.test | Maintenance |
| manager@hotel.test | Manager |
| admin@hotel.test | Admin |

Before seeding a public database, set `SEED_PASSWORD` to a private value, so nobody can log in with this password.

## Tests

With PostgreSQL running and the sample data loaded:

```bash
cd backend
.venv/bin/python -m pytest
```

Tests run against the real database, and each run removes the data it creates. They cover simultaneous booking, date overlaps, payments, login, access between roles and hotels, and maintenance blocking bookings.

## Possible next steps

- Expire unpaid `pending` bookings, which currently hold a room until cancelled
- Limit repeated login attempts
- Real payments through a payment provider
- Live staff dashboard updates with Neon Realtime
