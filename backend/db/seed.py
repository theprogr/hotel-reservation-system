"""Create the tables in hotel_v2 and fill them with made-up sample data.

Usage (from the backend folder):
    .venv/bin/python db/seed.py          # fails if the tables already exist
    .venv/bin/python db/seed.py --reset  # ERASES everything in this database first
"""
import os
import random
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

import bcrypt
import psycopg
from dotenv import load_dotenv

HERE = Path(__file__).resolve().parent
load_dotenv(HERE.parent / ".env")

DEMO_PASSWORD = "Demo1234!"  # Sample accounts only. See README.

CITIES = ["Almaty", "Astana", "Shymkent", "Aktau", "Atyrau", "Karaganda", "Turkistan", "Taraz", "Pavlodar", "Kostanay"]
HOTEL_WORDS = ["Grand", "Silk Road", "Steppe", "Mountain View", "Altyn", "Central", "Nomad", "City", "Riverside", "Royal"]
STREETS = ["Abay Ave", "Dostyk Ave", "Al-Farabi Ave", "Satpayev St", "Tole Bi St", "Nazarbayev Ave", "Baitursynov St", "Kabanbay Batyr Ave"]
FIRST = ["Aigerim", "Dias", "Madina", "Nurlan", "Aruzhan", "Yerlan", "Dana", "Timur", "Zarina", "Arman", "Kamila", "Sanzhar", "Aida", "Bekzat", "Laura", "Ruslan"]
LAST = ["Akhmetov", "Bekova", "Omarov", "Serikova", "Kassym", "Nurgali", "Tulegen", "Abenov", "Zhaksylyk", "Ospanov", "Karim", "Sadykov"]
TASKS = ["Air conditioner repair", "Plumbing check", "Deep cleaning", "Replace light fixtures", "Repaint walls", "TV repair", "Replace door lock", "Furniture repair"]
ROOM_PRICES = {"single": 18000, "double": 28000, "twin": 26000, "deluxe": 45000, "suite": 80000}

ROLES = [
    ("System Administrator", "Full access across all hotels", "admin"),
    ("General Manager", "Runs one hotel", "manager"),
    ("Assistant Manager", "Supports the general manager", "manager"),
    ("Operations Manager", "Oversees daily operations", "manager"),
    ("Front Office Manager", "Leads the front desk team", "manager"),
    ("Receptionist", "Handles bookings and check-ins", "front_desk"),
    ("Night Auditor", "Front desk and accounts overnight", "front_desk"),
    ("Reservations Agent", "Manages bookings", "front_desk"),
    ("Guest Relations Officer", "Handles guest requests", "front_desk"),
    ("Concierge", "Assists guests with arrangements", "front_desk"),
    ("Cashier", "Takes guest payments", "front_desk"),
    ("Maintenance Technician", "Completes room repairs", "maintenance"),
    ("Electrician", "Electrical repairs", "maintenance"),
    ("Plumber", "Plumbing repairs", "maintenance"),
    ("HVAC Technician", "Heating and cooling systems", "maintenance"),
    ("Chief Engineer", "Leads the maintenance team", "maintenance"),
    ("Housekeeper", "Cleans guest rooms", "maintenance"),
    ("Housekeeping Supervisor", "Inspects room cleaning", "maintenance"),
]
# Roles that need no special app access.
ROLES += [(title, None, "staff") for title in [
    "Bellhop", "Doorman", "Valet", "Laundry Attendant", "Chef", "Sous Chef", "Line Cook", "Pastry Chef",
    "Dishwasher", "Waiter", "Bartender", "Barista", "Restaurant Manager", "Banquet Coordinator",
    "Event Planner", "Spa Therapist", "Fitness Instructor", "Lifeguard", "Security Officer", "Driver",
    "Accountant", "HR Specialist", "Marketing Specialist", "Sales Executive", "IT Support Specialist",
    "Purchasing Officer", "Storekeeper", "Gardener", "Translator", "Trainee",
    "Revenue Analyst", "Quality Inspector",
]]


def seed(cur, rng):
    today = date.today()
    now = datetime.now()
    password_hash = bcrypt.hashpw(DEMO_PASSWORD.encode(), bcrypt.gensalt()).decode()

    # Hotels: 50, spread across cities.
    hotel_ids = []
    for i in range(50):
        city = CITIES[i % len(CITIES)]
        word = HOTEL_WORDS[(i // len(CITIES)) % len(HOTEL_WORDS)]
        cur.execute(
            "INSERT INTO hotels (name, address, city, phone) VALUES (%s, %s, %s, %s) RETURNING id",
            (f"{word} Hotel {city}", f"{rng.randint(1, 200)} {rng.choice(STREETS)}", city, f"+7700{rng.randint(1000000, 9999999)}"),
        )
        hotel_ids.append(cur.fetchone()[0])

    # Roles.
    role_ids = {}
    for name, description, level in ROLES:
        cur.execute(
            "INSERT INTO roles (role_name, description, access_level) VALUES (%s, %s, %s) RETURNING id",
            (name, description, level),
        )
        role_ids[name] = cur.fetchone()[0]

    # Rooms: 6 per hotel, in a realistic price range.
    rooms = []
    for hotel_id in hotel_ids:
        for n, room_type in enumerate(["single", "double", "double", "twin", "deluxe", "suite"]):
            floor = rng.randint(1, 5)
            price = ROOM_PRICES[room_type] + rng.randrange(0, 8000, 500)
            cur.execute(
                "INSERT INTO rooms (hotel_id, room_number, room_type, price_per_night) VALUES (%s, %s, %s, %s) RETURNING id",
                (hotel_id, floor * 100 + n + 1, room_type, price),
            )
            rooms.append((cur.fetchone()[0], hotel_id, price))

    # Employees: the demo accounts first, then a small team in every hotel.
    def add_employee(hotel_id, role, first, last, email, salary):
        cur.execute(
            """INSERT INTO employees (hotel_id, role_id, first_name, last_name, phone, email, hire_date, salary, password_hash)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
            (hotel_id, role_ids[role], first, last, f"+7701{rng.randint(1000000, 9999999)}", email,
             today - timedelta(days=rng.randint(30, 2000)), salary, password_hash),
        )
        return cur.fetchone()[0]

    first_hotel = hotel_ids[0]
    add_employee(first_hotel, "System Administrator", "Demo", "Admin", "admin@hotel.test", 900000)
    add_employee(first_hotel, "General Manager", "Demo", "Manager", "manager@hotel.test", 700000)
    add_employee(first_hotel, "Receptionist", "Demo", "Reception", "reception@hotel.test", 300000)
    demo_tech = add_employee(first_hotel, "Maintenance Technician", "Demo", "Technician", "tech@hotel.test", 280000)
    technicians = {first_hotel: [demo_tech]}
    for hotel_id in hotel_ids:
        for role, salary in [("General Manager", 650000), ("Receptionist", 280000), ("Maintenance Technician", 260000)]:
            first, last = rng.choice(FIRST), rng.choice(LAST)
            employee_id = add_employee(hotel_id, role, first, last, f"{role.split()[0].lower()}{hotel_id}@hotel.test", salary)
            if role == "Maintenance Technician":
                technicians.setdefault(hotel_id, []).append(employee_id)

    # Guests: 100, plus one easy demo account.
    guest_ids = []
    cur.execute(
        "INSERT INTO guests (name, email, phone, password_hash) VALUES (%s, %s, %s, %s) RETURNING id",
        ("Demo Guest", "guest@hotel.test", "+77000000000", password_hash),
    )
    guest_ids.append(cur.fetchone()[0])
    for i in range(1, 100):
        first, last = rng.choice(FIRST), rng.choice(LAST)
        cur.execute(
            "INSERT INTO guests (name, email, phone, password_hash) VALUES (%s, %s, %s, %s) RETURNING id",
            (f"{first} {last}", f"guest{i}@example.test", f"+7702{rng.randint(1000000, 9999999)}", password_hash),
        )
        guest_ids.append(cur.fetchone()[0])

    # Reservations: walk through each sampled room's calendar so that stays never overlap.
    made = 0
    methods = ["card", "cash", "kaspi", "bank_transfer"]
    for room_id, _hotel_id, price in rng.sample(rooms, 80):
        # Start anywhere from 60 days ago to 20 days ahead, for past, current and future stays.
        cursor_day = today + timedelta(days=rng.randint(-60, 20))
        for _ in range(rng.randint(1, 3)):
            check_in = cursor_day + timedelta(days=rng.randint(0, 12))
            nights = rng.randint(1, 6)
            check_out = check_in + timedelta(days=nights)
            cursor_day = check_out
            if check_out <= today:
                status = rng.choices(["checked_out", "cancelled", "no_show"], [85, 10, 5])[0]
            elif check_in <= today:
                status = "checked_in"
            else:
                status = rng.choice(["pending", "confirmed", "confirmed", "cancelled"])
            cur.execute(
                """INSERT INTO reservations (guest_id, room_id, check_in, check_out, status, created_at)
                   VALUES (%s, %s, %s, %s, %s, %s) RETURNING id""",
                (rng.choice(guest_ids), room_id, check_in, check_out, status,
                 datetime.combine(check_in, datetime.min.time()) - timedelta(days=rng.randint(1, 30))),
            )
            reservation_id = cur.fetchone()[0]
            made += 1

            pay_status = {"checked_out": "paid", "checked_in": "paid", "confirmed": "paid"}.get(status)
            if status == "cancelled" and rng.random() < 0.5:
                pay_status = "refunded"
            if pay_status:
                paid_on = min(now, datetime.combine(check_in, datetime.min.time()))
                cur.execute(
                    """INSERT INTO payments (reservation_id, amount, payment_date, payment_method, status)
                       VALUES (%s, %s, %s, %s, %s)""",
                    (reservation_id, price * nights, paid_on, rng.choice(methods), pay_status),
                )

    # Maintenance: 100 tasks. Rooms with unfinished work are marked as under maintenance.
    for _ in range(100):
        room_id, hotel_id, _price = rng.choice(rooms)
        created = now - timedelta(days=rng.randint(0, 120), hours=rng.randint(0, 23))
        status = rng.choices(["completed", "pending", "in_progress", "cancelled"], [90, 3, 3, 4])[0]
        completed = created + timedelta(hours=rng.randint(1, 48)) if status == "completed" else None
        if completed and completed > now:
            completed = now
        cur.execute(
            """INSERT INTO room_maintenance (room_id, employee_id, task_type, status, created_at, completed_at)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (room_id, rng.choice(technicians[hotel_id]), rng.choice(TASKS), status, created, completed),
        )
        if status in ("pending", "in_progress"):
            cur.execute("UPDATE rooms SET status = 'maintenance' WHERE id = %s", (room_id,))
    return made


def main():
    url = os.environ["DATABASE_URL"]
    if url.rsplit("/", 1)[-1] != "hotel_v2" and "--reset" in sys.argv:
        sys.exit("Refusing --reset: DATABASE_URL does not point at hotel_v2.")
    with psycopg.connect(url) as conn:
        with conn.cursor() as cur:
            if "--reset" in sys.argv:
                cur.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
            cur.execute((HERE / "schema.sql").read_text())
            seed(cur, random.Random(42))
        rows = {}
        for table in ["hotels", "roles", "guests", "rooms", "employees", "reservations", "room_maintenance", "payments"]:
            rows[table] = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    print("Seeded:", rows)


if __name__ == "__main__":
    main()
