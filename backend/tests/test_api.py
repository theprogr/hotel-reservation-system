"""End-to-end API tests against the local hotel_v2 database.
Each test run creates its own hotels and guests, then removes them afterwards."""
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.db import fetch_all, fetch_one, pool
from app.main import app
from app.security import hash_password

PASSWORD = "TestPass123!"
# Far ahead, so tests never collide with sample bookings.
START = date.today() + timedelta(days=400)


def stay(offset=0, nights=2):
    check_in = START + timedelta(days=offset)
    return {"check_in": str(check_in), "check_out": str(check_in + timedelta(days=nights))}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def world(client):
    """Two private test hotels, with staff, so hotel-to-hotel access can be tested."""
    tag = uuid.uuid4().hex[:8]
    pw = hash_password(PASSWORD)
    level_role = lambda level: fetch_one("SELECT id FROM roles WHERE access_level = %s ORDER BY id LIMIT 1", (level,))["id"]
    hotel_a = fetch_one("INSERT INTO hotels (name, city) VALUES (%s, 'Testville') RETURNING id", (f"Test A {tag}",))["id"]
    hotel_b = fetch_one("INSERT INTO hotels (name, city) VALUES (%s, 'Testville') RETURNING id", (f"Test B {tag}",))["id"]

    def room(hotel, number, price=10000):
        return fetch_one(
            "INSERT INTO rooms (hotel_id, room_number, room_type, price_per_night) VALUES (%s, %s, 'double', %s) RETURNING id",
            (hotel, number, price),
        )["id"]

    def employee(hotel, level):
        email = f"{level}-{hotel}-{tag}@hotel.test"
        employee_id = fetch_one(
            """INSERT INTO employees (hotel_id, role_id, first_name, last_name, email, password_hash)
               VALUES (%s, %s, 'T', 'Est', %s, %s) RETURNING id""",
            (hotel, level_role(level), email, pw),
        )["id"]
        return {"id": employee_id, "email": email}

    def auth_headers(email):
        response = client.post("/auth/login", json={"email": email, "password": PASSWORD})
        assert response.status_code == 200, response.text
        return {"Authorization": f"Bearer {response.json()['token']}"}

    def new_guest():
        email = f"guest{uuid.uuid4().hex[:10]}@mailbox.org"
        response = client.post("/auth/register", json={"name": "Test Guest", "email": email, "password": PASSWORD})
        assert response.status_code == 201, response.text
        guest_emails.append(email)
        return {"Authorization": f"Bearer {response.json()['token']}"}

    guest_emails = []
    manager_a = employee(hotel_a, "manager")
    manager_b = employee(hotel_b, "manager")
    desk_a = employee(hotel_a, "front_desk")
    tech_a = employee(hotel_a, "maintenance")
    admin = employee(hotel_a, "admin")

    yield {
        "hotel_a": hotel_a, "hotel_b": hotel_b, "room": room, "new_guest": new_guest,
        "manager_a": auth_headers(manager_a["email"]), "manager_b": auth_headers(manager_b["email"]),
        "desk_a": auth_headers(desk_a["email"]), "tech_a": auth_headers(tech_a["email"]),
        "admin": auth_headers(admin["email"]), "tech_a_id": tech_a["id"], "manager_a_id": manager_a["id"],
    }

    # Clean up everything these tests created, children before parents.
    hotels = (hotel_a, hotel_b)
    with pool.connection() as conn:
        conn.execute(
            """DELETE FROM payments WHERE reservation_id IN (
                 SELECT res.id FROM reservations res JOIN rooms r ON r.id = res.room_id WHERE r.hotel_id = ANY(%s))""",
            (list(hotels),),
        )
        conn.execute("DELETE FROM reservations WHERE room_id IN (SELECT id FROM rooms WHERE hotel_id = ANY(%s))", (list(hotels),))
        conn.execute("DELETE FROM room_maintenance WHERE room_id IN (SELECT id FROM rooms WHERE hotel_id = ANY(%s))", (list(hotels),))
        conn.execute("DELETE FROM employees WHERE hotel_id = ANY(%s)", (list(hotels),))
        conn.execute("DELETE FROM rooms WHERE hotel_id = ANY(%s)", (list(hotels),))
        conn.execute("DELETE FROM hotels WHERE id = ANY(%s)", (list(hotels),))
        conn.execute("DELETE FROM guests WHERE email = ANY(%s)", (guest_emails,))


# --- The headline feature ---
def test_simultaneous_bookings_only_one_wins(client, world):
    """Twenty guests try to book one room at the same moment. Exactly one may succeed."""
    room = world["room"](world["hotel_a"], 101)
    guests = [world["new_guest"]() for _ in range(20)]

    def attempt(headers):
        return client.post("/reservations", json={"room_id": room, **stay()}, headers=headers).status_code

    with ThreadPoolExecutor(max_workers=20) as pool_:
        codes = list(pool_.map(attempt, guests))

    assert codes.count(201) == 1, codes
    assert codes.count(409) == 19, codes
    active = fetch_all("SELECT id FROM reservations WHERE room_id = %s", (room,))
    assert len(active) == 1


def test_overlap_rules(client, world):
    room = world["room"](world["hotel_a"], 102)
    guest = world["new_guest"]()
    book = lambda s: client.post("/reservations", json={"room_id": room, **s}, headers=guest).status_code
    assert book(stay(0, 3)) == 201
    assert book(stay(1, 1)) == 409  # inside the stay
    assert book(stay(-1, 2)) == 409  # overlaps the first night
    assert book(stay(3, 2)) == 201  # checks in the day the other checks out
    assert book(stay(-2, 2)) == 201  # checks out the day the other checks in


def test_cancelling_frees_the_room(client, world):
    room = world["room"](world["hotel_a"], 103)
    guest = world["new_guest"]()
    body = {"room_id": room, **stay()}
    reservation = client.post("/reservations", json=body, headers=guest).json()
    assert client.post("/reservations", json=body, headers=guest).status_code == 409
    assert client.post(f"/reservations/{reservation['id']}/cancel", headers=guest).status_code == 200
    assert client.post("/reservations", json=body, headers=guest).status_code == 201


def test_search_hides_booked_rooms(client, world):
    room = world["room"](world["hotel_b"], 104)
    guest = world["new_guest"]()
    params = {"hotel_id": world["hotel_b"], "limit": 100, **stay()}
    ids = lambda p: [r["id"] for r in client.get("/rooms/search", params=p).json()["rooms"]]
    assert room in ids(params)
    client.post("/reservations", json={"room_id": room, **stay()}, headers=guest)
    assert room not in ids(params)
    assert room in ids({**params, **stay(10)})


@pytest.mark.parametrize("dates", [
    {"check_in": str(date.today() - timedelta(days=1)), "check_out": str(date.today() + timedelta(days=1))},
    {"check_in": str(START), "check_out": str(START)},
    {"check_in": str(START), "check_out": str(START - timedelta(days=1))},
    {"check_in": str(START), "check_out": str(START + timedelta(days=61))},
])
def test_bad_dates_are_rejected(client, world, dates):
    room = world["room"](world["hotel_a"], 5000 + abs(hash(str(dates))) % 1000)
    guest = world["new_guest"]()
    assert client.post("/reservations", json={"room_id": room, **dates}, headers=guest).status_code == 422
    assert client.get("/rooms/search", params=dates).status_code == 422


# --- Payments ---
def test_payment_uses_server_price_and_only_once(client, world):
    room = world["room"](world["hotel_a"], 105, price=12500)
    guest = world["new_guest"]()
    reservation = client.post("/reservations", json={"room_id": room, **stay(0, 3)}, headers=guest).json()
    # A price sent by the browser is ignored.
    paid = client.post(f"/reservations/{reservation['id']}/pay", json={"payment_method": "card", "amount": 1}, headers=guest)
    assert paid.status_code == 200
    assert paid.json()["status"] == "confirmed"
    amount = fetch_one("SELECT amount FROM payments WHERE reservation_id = %s", (reservation["id"],))["amount"]
    assert amount == 37500
    assert client.post(f"/reservations/{reservation['id']}/pay", json={"payment_method": "card"}, headers=guest).status_code == 409


def test_cancelling_a_paid_booking_refunds_it(client, world):
    room = world["room"](world["hotel_a"], 106)
    guest = world["new_guest"]()
    reservation = client.post("/reservations", json={"room_id": room, **stay()}, headers=guest).json()
    client.post(f"/reservations/{reservation['id']}/pay", json={"payment_method": "cash"}, headers=guest)
    client.post(f"/reservations/{reservation['id']}/cancel", headers=guest)
    assert fetch_one("SELECT status FROM payments WHERE reservation_id = %s", (reservation["id"],))["status"] == "refunded"


# --- Accounts and security ---
def test_login_and_duplicate_email(client, world):
    email = f"Dup{uuid.uuid4().hex[:8]}@mailbox.org"
    body = {"name": "A", "email": email, "password": PASSWORD}
    assert client.post("/auth/register", json=body).status_code == 201
    assert client.post("/auth/register", json={**body, "email": email.upper()}).status_code == 409
    assert client.post("/auth/login", json={"email": email, "password": "wrong-password"}).status_code == 401
    assert client.post("/auth/login", json={"email": email.upper(), "password": PASSWORD}).status_code == 200
    with pool.connection() as conn:
        conn.execute("DELETE FROM guests WHERE LOWER(email) = LOWER(%s)", (email,))


def test_password_hash_never_leaves_the_api(client, world):
    for path in ["/staff/employees", "/staff/guests"]:
        response = client.get(path, headers=world["admin"])
        assert response.status_code == 200
        assert "password_hash" not in response.text
    assert "password_hash" not in client.get("/auth/me", headers=world["admin"]).text


def test_login_is_required(client):
    assert client.get("/reservations/mine").status_code == 401
    assert client.get("/staff/rooms").status_code == 401
    assert client.get("/staff/rooms", headers={"Authorization": "Bearer not.a.token"}).status_code == 401


def test_guests_cannot_see_each_other_or_staff_pages(client, world):
    room = world["room"](world["hotel_a"], 107)
    owner, stranger = world["new_guest"](), world["new_guest"]()
    reservation = client.post("/reservations", json={"room_id": room, **stay()}, headers=owner).json()
    assert client.post(f"/reservations/{reservation['id']}/cancel", headers=stranger).status_code == 404
    assert client.post(f"/reservations/{reservation['id']}/pay", json={"payment_method": "card"}, headers=stranger).status_code == 404
    assert client.get("/staff/reservations", headers=owner).status_code == 403
    assert client.post("/admin/hotels", json={"name": "X", "city": "Y"}, headers=owner).status_code == 403


def test_staff_stay_inside_their_hotel(client, world):
    room_a = world["room"](world["hotel_a"], 108)
    room_b = world["room"](world["hotel_b"], 109)
    guest = world["new_guest"]()
    reservation_b = client.post("/reservations", json={"room_id": room_b, **stay()}, headers=guest).json()

    manager = world["manager_a"]
    assert client.patch(f"/staff/rooms/{room_b}", json={"price_per_night": 1}, headers=manager).status_code == 403
    assert client.patch(f"/staff/rooms/{room_a}", json={"price_per_night": 9000}, headers=manager).status_code == 200
    assert client.post(f"/reservations/{reservation_b['id']}/cancel", headers=manager).status_code == 404
    assert all(r["hotel_id"] == world["hotel_a"] for r in client.get("/staff/rooms", headers=manager).json())
    # A manager creating a room always gets their own hotel, whatever they send.
    created = client.post("/staff/rooms", json={"hotel_id": world["hotel_b"], "room_number": 110, "room_type": "single", "price_per_night": 1}, headers=manager)
    assert created.json()["hotel_id"] == world["hotel_a"]


def test_managers_cannot_raise_access(client, world):
    admin_role = fetch_one("SELECT id FROM roles WHERE access_level = 'admin' LIMIT 1")["id"]
    desk_role = fetch_one("SELECT id FROM roles WHERE access_level = 'front_desk' LIMIT 1")["id"]
    manager = world["manager_a"]
    body = {"role_id": admin_role, "first_name": "E", "last_name": "Vil", "email": f"e{uuid.uuid4().hex[:8]}@mailbox.org", "password": PASSWORD}
    assert client.post("/staff/employees", json=body, headers=manager).status_code == 403
    # Not themselves either, and no admin-only pages.
    assert client.patch(f"/staff/employees/{world['manager_a_id']}", json={"role_id": admin_role}, headers=manager).status_code == 403
    assert client.post("/admin/roles", json={"role_name": "X"}, headers=manager).status_code == 403
    # A role they may assign still works.
    assert client.post("/staff/employees", json={**body, "role_id": desk_role}, headers=manager).status_code == 201


def test_technicians_cannot_see_revenue(client, world):
    assert "revenue_30_days" not in client.get("/staff/summary", headers=world["tech_a"]).json()
    assert "revenue_30_days" in client.get("/staff/summary", headers=world["manager_a"]).json()


def test_front_desk_cannot_see_salaries_or_manage_rooms(client, world):
    desk = world["desk_a"]
    assert all("salary" not in e for e in client.get("/staff/employees", headers=desk).json())
    assert client.post("/staff/rooms", json={"room_number": 1, "room_type": "single", "price_per_night": 1}, headers=desk).status_code == 403


def test_every_staff_page_opens_for_the_right_roles(client, world):
    pages = {
        "/staff/summary": {"admin", "manager_a", "desk_a", "tech_a"},
        "/staff/rooms": {"admin", "manager_a", "desk_a", "tech_a"},
        "/staff/maintenance": {"admin", "manager_a", "desk_a", "tech_a"},
        "/staff/reservations": {"admin", "manager_a", "desk_a"},
        "/staff/reservations?status=confirmed": {"admin", "manager_a", "desk_a"},
        "/staff/payments": {"admin", "manager_a", "desk_a"},
        "/staff/guests": {"admin", "manager_a", "desk_a"},
        "/staff/employees": {"admin", "manager_a", "desk_a"},
        "/staff/roles": {"admin", "manager_a"},
        "/admin/hotels": {"admin"},
        "/admin/roles": {"admin"},
    }
    for path, allowed in pages.items():
        for who in ["admin", "manager_a", "desk_a", "tech_a"]:
            expected = 200 if who in allowed else 403
            assert client.get(path, headers=world[who]).status_code == expected, (path, who)


# --- Stay flow and maintenance ---
def test_check_in_requires_payment_and_start_date(client, world):
    room = world["room"](world["hotel_a"], 111)
    guest = world["new_guest"]()
    desk = world["desk_a"]
    today_stay = {"check_in": str(date.today()), "check_out": str(date.today() + timedelta(days=1))}
    reservation = client.post("/reservations", json={"room_id": room, **today_stay}, headers=guest).json()
    status = lambda s: client.post(f"/staff/reservations/{reservation['id']}/status", json={"status": s}, headers=desk).status_code
    assert status("checked_in") == 409  # not paid
    client.post(f"/reservations/{reservation['id']}/pay", json={"payment_method": "card"}, headers=guest)
    assert status("checked_out") == 409  # not checked in yet
    assert status("checked_in") == 200
    assert client.post(f"/reservations/{reservation['id']}/cancel", headers=guest).status_code == 409
    assert status("checked_out") == 200


def test_maintenance_blocks_booking_until_finished(client, world):
    room = world["room"](world["hotel_a"], 112)
    guest = world["new_guest"]()
    task = client.post(
        "/staff/maintenance",
        json={"room_id": room, "employee_id": world["tech_a_id"], "task_type": "Fix sink"},
        headers=world["desk_a"],
    )
    assert task.status_code == 201
    body = {"room_id": room, **stay()}
    assert client.post("/reservations", json=body, headers=guest).status_code == 409
    done = client.patch(f"/staff/maintenance/{task.json()['id']}", json={"status": "completed"}, headers=world["tech_a"])
    assert done.status_code == 200
    assert done.json()["completed_at"] is not None
    assert client.post("/reservations", json=body, headers=guest).status_code == 201
