import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api, formatDate, formatMoney, isoDate, label } from "../api";

const METHODS = ["card", "kaspi", "bank_transfer", "cash"];

export function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{label(status)}</span>;
}

function Booking({ booking, onChange }) {
  const [method, setMethod] = useState("card");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const act = async (path, body) => {
    setBusy(true);
    setError("");
    try {
      onChange(await api(`/reservations/${booking.id}/${path}`, { method: "POST", body }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const canCancel = ["pending", "confirmed"].includes(booking.status) && booking.check_in > isoDate();

  return (
    <article className="card booking">
      <div className="booking-head">
        <div>
          <h2>{booking.hotel_name}</h2>
          <p className="muted">{label(booking.room_type)} room · No. {booking.room_number} · {booking.city}</p>
        </div>
        <StatusBadge status={booking.status} />
      </div>
      <dl className="facts">
        <div><dt>Check-in</dt><dd>{formatDate(booking.check_in)}</dd></div>
        <div><dt>Check-out</dt><dd>{formatDate(booking.check_out)}</dd></div>
        <div><dt>Nights</dt><dd>{booking.nights}</dd></div>
        <div><dt>Total</dt><dd>{formatMoney(booking.total_price)}</dd></div>
        {booking.payment_status && <div><dt>Payment</dt><dd>{label(booking.payment_status)} · {label(booking.payment_method)}</dd></div>}
      </dl>
      {error && <p className="error" role="alert">{error}</p>}
      {(booking.status === "pending" || canCancel) && (
        <div className="actions">
          {booking.status === "pending" && (
            <>
              <label className="inline">Pay with
                <select value={method} onChange={(e) => setMethod(e.target.value)}>
                  {METHODS.map((m) => <option key={m} value={m}>{label(m)}</option>)}
                </select>
              </label>
              <button className="primary" disabled={busy} onClick={() => act("pay", { payment_method: method })}>
                Pay {formatMoney(booking.total_price)}
              </button>
            </>
          )}
          {canCancel && (
            <button
              className="danger"
              disabled={busy}
              onClick={() => { if (window.confirm("Cancel this booking?")) act("cancel"); }}
            >
              Cancel booking
            </button>
          )}
        </div>
      )}
      {booking.status === "pending" && <p className="muted small">Demo payment: no money moves and no card details are collected.</p>}
    </article>
  );
}

export default function MyBookings() {
  const { state } = useLocation();
  const [bookings, setBookings] = useState(null);
  const [error, setError] = useState("");
  const [showBooked, setShowBooked] = useState(Boolean(state?.justBooked));

  useEffect(() => {
    api("/reservations/mine").then(setBookings).catch((e) => setError(e.message));
  }, []);

  const replace = (updated) => {
    setShowBooked(false);
    setBookings((list) => list.map((b) => (b.id === updated.id ? updated : b)));
  };

  return (
    <div className="wrap page">
      <h1>My bookings</h1>
      {showBooked && <p className="success" role="status">Your room is reserved. Pay below to confirm it.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {!bookings && !error && <p className="muted">Loading…</p>}
      {bookings?.length === 0 && (
        <p className="card center">You have no bookings yet. <Link to="/">Find a room</Link></p>
      )}
      <div className="stack">
        {bookings?.map((booking) => <Booking key={booking.id} booking={booking} onChange={replace} />)}
      </div>
    </div>
  );
}
