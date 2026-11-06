-- Hotel Reservation System: the 8 tables, their rules, and one reporting view.
-- Rules live in the database, so they hold no matter which program writes the data.

-- Lets one GiST index combine "same room" (=) with "dates overlap" (&&).
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE hotels (
    id      SERIAL PRIMARY KEY,
    name    VARCHAR(255) NOT NULL,
    address VARCHAR(255),
    city    VARCHAR(100) NOT NULL,
    phone   VARCHAR(20)
);

CREATE TABLE roles (
    id           SERIAL PRIMARY KEY,
    role_name    VARCHAR(100) NOT NULL UNIQUE,
    description  VARCHAR(255),
    -- What the role may do in the app. Job titles can change without touching code.
    access_level VARCHAR(20) NOT NULL DEFAULT 'staff'
        CHECK (access_level IN ('admin', 'manager', 'front_desk', 'maintenance', 'staff'))
);

CREATE TABLE guests (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(255) NOT NULL,
    email         VARCHAR(255) NOT NULL,
    phone         VARCHAR(20),
    password_hash VARCHAR(255) NOT NULL
);

CREATE TABLE rooms (
    id              SERIAL PRIMARY KEY,
    hotel_id        INTEGER NOT NULL REFERENCES hotels(id),
    room_number     INTEGER NOT NULL CHECK (room_number > 0),
    room_type       VARCHAR(50) NOT NULL
        CHECK (room_type IN ('single', 'double', 'twin', 'deluxe', 'suite')),
    price_per_night NUMERIC(10, 2) NOT NULL CHECK (price_per_night >= 0),
    status          VARCHAR(50) NOT NULL DEFAULT 'available'
        CHECK (status IN ('available', 'maintenance', 'out_of_service')),
    -- A room number can repeat across hotels, but not inside one hotel.
    UNIQUE (hotel_id, room_number)
);

CREATE TABLE employees (
    id            SERIAL PRIMARY KEY,
    hotel_id      INTEGER NOT NULL REFERENCES hotels(id),
    role_id       INTEGER NOT NULL REFERENCES roles(id),
    first_name    VARCHAR(100) NOT NULL,
    last_name     VARCHAR(100) NOT NULL,
    phone         VARCHAR(20),
    email         VARCHAR(255) NOT NULL,
    hire_date     DATE NOT NULL DEFAULT CURRENT_DATE,
    salary        NUMERIC(10, 2) CHECK (salary >= 0),
    password_hash VARCHAR(255) NOT NULL
);

CREATE TABLE reservations (
    id         SERIAL PRIMARY KEY,
    guest_id   INTEGER NOT NULL REFERENCES guests(id),
    room_id    INTEGER NOT NULL REFERENCES rooms(id),
    check_in   DATE NOT NULL,
    check_out  DATE NOT NULL,
    status     VARCHAR(50) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_stay_dates CHECK (check_out > check_in),
    -- THE KEY RULE: an active booking can never overlap another on the same room.
    -- '[)' ranges mean one guest can check out the same day the next checks in.
    -- Postgres enforces this even when two requests arrive at the same moment.
    CONSTRAINT no_double_booking EXCLUDE USING gist (
        room_id WITH =,
        daterange(check_in, check_out, '[)') WITH &&
    ) WHERE (status IN ('pending', 'confirmed', 'checked_in'))
);

CREATE TABLE room_maintenance (
    id           SERIAL PRIMARY KEY,
    room_id      INTEGER NOT NULL REFERENCES rooms(id),
    employee_id  INTEGER NOT NULL REFERENCES employees(id),
    task_type    VARCHAR(100) NOT NULL,
    status       VARCHAR(50) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    CONSTRAINT completed_after_created CHECK (completed_at IS NULL OR completed_at >= created_at)
);

CREATE TABLE payments (
    id             SERIAL PRIMARY KEY,
    reservation_id INTEGER NOT NULL REFERENCES reservations(id),
    amount         NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    payment_date   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    payment_method VARCHAR(50) NOT NULL
        CHECK (payment_method IN ('card', 'cash', 'kaspi', 'bank_transfer')),
    status         VARCHAR(50) NOT NULL DEFAULT 'paid'
        CHECK (status IN ('paid', 'refunded', 'failed'))
);

-- Emails are unique regardless of capital letters.
CREATE UNIQUE INDEX guests_email_unique ON guests (LOWER(email));
CREATE UNIQUE INDEX employees_email_unique ON employees (LOWER(email));

-- A reservation can only be paid once, even if the button is clicked twice.
CREATE UNIQUE INDEX one_paid_payment_per_reservation ON payments (reservation_id) WHERE status = 'paid';

-- Postgres does not index foreign keys on its own; these keep joins and filters fast.
CREATE INDEX employees_hotel_idx ON employees (hotel_id);
CREATE INDEX employees_role_idx ON employees (role_id);
CREATE INDEX reservations_guest_idx ON reservations (guest_id);
CREATE INDEX reservations_status_idx ON reservations (status);
CREATE INDEX maintenance_room_idx ON room_maintenance (room_id);
CREATE INDEX maintenance_employee_idx ON room_maintenance (employee_id);
CREATE INDEX payments_reservation_idx ON payments (reservation_id);
CREATE INDEX hotels_city_idx ON hotels (LOWER(city));

-- One readable row per reservation, used by the guest and staff screens.
CREATE VIEW reservation_details AS
SELECT
    res.id,
    res.status,
    res.check_in,
    res.check_out,
    res.created_at,
    res.check_out - res.check_in AS nights,
    (res.check_out - res.check_in) * r.price_per_night AS total_price,
    g.id AS guest_id,
    g.name AS guest_name,
    g.email AS guest_email,
    r.id AS room_id,
    r.room_number,
    r.room_type,
    r.price_per_night,
    h.id AS hotel_id,
    h.name AS hotel_name,
    h.city,
    p.id AS payment_id,
    p.payment_method,
    p.status AS payment_status
FROM reservations res
JOIN guests g ON g.id = res.guest_id
JOIN rooms r ON r.id = res.room_id
JOIN hotels h ON h.id = r.hotel_id
LEFT JOIN LATERAL (
    SELECT id, payment_method, status
    FROM payments
    WHERE reservation_id = res.id
    ORDER BY payment_date DESC, id DESC
    LIMIT 1
) p ON TRUE;
