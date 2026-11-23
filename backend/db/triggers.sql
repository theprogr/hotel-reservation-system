-- Triggers: business rules the database enforces, whatever program writes the data.
-- Each error message is written for the guest or employee who will see it.

-- 1. Bookings must fit the room.
--    Rule: a room can only be booked while it is open, and never for more guests than it sleeps.
CREATE OR REPLACE FUNCTION enforce_reservation_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_room rooms%ROWTYPE;
BEGIN
    SELECT * INTO v_room FROM rooms WHERE id = NEW.room_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Room % does not exist', NEW.room_id;
    END IF;

    IF TG_OP = 'INSERT' AND v_room.status <> 'available' THEN
        RAISE EXCEPTION 'Room % is not open for booking right now', v_room.room_number;
    END IF;

    IF NEW.num_guests > v_room.capacity THEN
        RAISE EXCEPTION 'This room sleeps at most % guest(s)', v_room.capacity;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reservation_rules
BEFORE INSERT OR UPDATE OF room_id, num_guests ON reservations
FOR EACH ROW EXECUTE FUNCTION enforce_reservation_rules();


-- 2. Payments must be for the right amount, on a booking that is still going ahead.
--    Rule: the amount must equal the stay's price, and cancelled or no-show bookings can't be paid.
CREATE OR REPLACE FUNCTION validate_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_status VARCHAR;
BEGIN
    IF NEW.status <> 'paid' THEN
        RETURN NEW;
    END IF;

    SELECT status INTO v_status FROM reservations WHERE id = NEW.reservation_id;
    IF v_status IN ('cancelled', 'no_show') THEN
        RAISE EXCEPTION 'A % reservation can''t be paid', REPLACE(v_status, '_', ' ');
    END IF;

    IF NEW.amount <> calculate_reservation_total(NEW.reservation_id) THEN
        RAISE EXCEPTION 'The payment amount must equal the price of the stay';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_payment
BEFORE INSERT ON payments
FOR EACH ROW EXECUTE FUNCTION validate_payment();


-- 3. Paying confirms the booking.
--    Rule: when a pending reservation receives a paid payment, it becomes confirmed.
CREATE OR REPLACE FUNCTION confirm_paid_reservation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = 'paid' THEN
        UPDATE reservations SET status = 'confirmed'
         WHERE id = NEW.reservation_id AND status = 'pending';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_confirm_paid_reservation
AFTER INSERT ON payments
FOR EACH ROW EXECUTE FUNCTION confirm_paid_reservation();


-- 4. Cancelling refunds the guest.
--    Rule: when a reservation is cancelled, its paid payment is marked refunded.
CREATE OR REPLACE FUNCTION refund_cancelled_reservation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE payments SET status = 'refunded'
     WHERE reservation_id = NEW.id AND status = 'paid';
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_refund_cancelled_reservation
AFTER UPDATE OF status ON reservations
FOR EACH ROW
WHEN (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
EXECUTE FUNCTION refund_cancelled_reservation();


-- 5. Finishing a task records when it was finished.
--    Rule: completed_at is set when a task is completed, and cleared otherwise.
CREATE OR REPLACE FUNCTION set_maintenance_completed_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
        NEW.completed_at := CURRENT_TIMESTAMP;
    ELSIF NEW.status <> 'completed' THEN
        NEW.completed_at := NULL;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_maintenance_completed_at
BEFORE UPDATE OF status ON room_maintenance
FOR EACH ROW EXECUTE FUNCTION set_maintenance_completed_at();


-- 6. Rooms under repair can't be booked.
--    Rule: a room with unfinished maintenance is closed to bookings, and reopens when
--    its last open task is completed or cancelled. Rooms closed by a manager stay closed.
CREATE OR REPLACE FUNCTION sync_room_maintenance_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_open_tasks INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_open_tasks
      FROM room_maintenance
     WHERE room_id = NEW.room_id AND status IN ('pending', 'in_progress');

    IF v_open_tasks > 0 THEN
        UPDATE rooms SET status = 'maintenance' WHERE id = NEW.room_id AND status = 'available';
    ELSE
        UPDATE rooms SET status = 'available' WHERE id = NEW.room_id AND status = 'maintenance';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_room_maintenance_status
AFTER INSERT OR UPDATE OF status ON room_maintenance
FOR EACH ROW EXECUTE FUNCTION sync_room_maintenance_status();
