import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { api, formatDate, formatMoney, label, nightsBetween, plural, ROOM_INFO } from "../api";
import { useAuth } from "../auth";
import { HotelArt } from "../components/Art";
import Stars from "../components/Stars";

function Steps({ current }) {
  const steps = ["Your selection", "Your details", "Confirmation"];
  return (
    <ol className="steps" aria-label="Booking steps">
      {steps.map((step, i) => (
        <li key={step} className={i < current ? "done" : i === current ? "current" : ""} aria-current={i === current ? "step" : undefined}>
          <span className="step-dot">{i < current ? "✓" : i + 1}</span>{step}
        </li>
      ))}
    </ol>
  );
}

export default function Checkout() {
  const { state } = useLocation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!state?.room) return <Navigate to="/" replace />;
  const { hotel, room, search } = state;
  const nights = nightsBetween(search.check_in, search.check_out);

  const book = async () => {
    setBusy(true);
    setError("");
    try {
      await api("/reservations", {
        method: "POST",
        body: { room_id: room.id, check_in: search.check_in, check_out: search.check_out, num_guests: search.guests },
      });
      navigate("/bookings", { state: { justBooked: true } });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="wrap page-body">
      <Steps current={user ? 1 : 0} />
      <div className="checkout">
        <aside className="card summary">
          <HotelArt hotel={hotel} className="summary-art" />
          <div className="tag-row"><span className="tag">Hotel</span><Stars count={hotel.stars} size="small" /></div>
          <h2>{hotel.name}</h2>
          <p className="muted small">{hotel.address ? `${hotel.address}, ` : ""}{hotel.city}</p>
          <dl className="facts stacked">
            <div><dt>Check-in</dt><dd>{formatDate(search.check_in)}</dd></div>
            <div><dt>Check-out</dt><dd>{formatDate(search.check_out)}</dd></div>
            <div><dt>Length of stay</dt><dd>{plural(nights, "night")}</dd></div>
            <div><dt>You selected</dt><dd>{label(room.room_type)} room for {plural(search.guests, "guest")}</dd></div>
          </dl>
          <div className="price-summary">
            <span>Total price</span>
            <strong>{formatMoney(room.total_price)}</strong>
          </div>
          <p className="muted small">{formatMoney(room.price_per_night)} × {plural(nights, "night")}</p>
        </aside>

        <section className="card checkout-main">
          <h1>{user ? "Check your details" : "Log in to finish booking"}</h1>
          {!user && (
            <>
              <p>You need a guest account to book. It only takes a minute.</p>
              <div className="actions">
                <Link className="button primary" to="/login" state={{ returnTo: "/book", booking: state }}>Log in</Link>
                <Link className="button" to="/register" state={{ returnTo: "/book", booking: state }}>Create an account</Link>
              </div>
            </>
          )}
          {user?.kind === "employee" && <p className="notice">Staff accounts can't make bookings. Please use a guest account.</p>}
          {user?.kind === "guest" && (
            <>
              <dl className="facts stacked">
                <div><dt>Name</dt><dd>{user.name}</dd></div>
                <div><dt>Email</dt><dd>{user.email}</dd></div>
                {user.phone && <div><dt>Phone</dt><dd>{user.phone}</dd></div>}
              </dl>
              <h2>Good to know</h2>
              <ul className="checklist">
                <li>The room is held for you as soon as you book.</li>
                <li>Pay from My bookings to confirm it. Payments are simulated.</li>
                <li>Free cancellation until the day before check-in.</li>
                <li>{ROOM_INFO[room.room_type]?.beds}, room {room.room_number}.</li>
              </ul>
              {error && <p className="error" role="alert">{error}</p>}
              <button className="primary big" disabled={busy} onClick={book}>{busy ? "Booking…" : "Complete booking"}</button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
