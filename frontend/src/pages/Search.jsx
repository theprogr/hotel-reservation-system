import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, formatMoney, isoDate, label } from "../api";
import { useAuth } from "../auth";

const ROOM_TYPES = ["single", "double", "twin", "deluxe", "suite"];
const PAGE_SIZE = 24;

export default function Search() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { state } = useLocation();
  const [cities, setCities] = useState([]);
  const [form, setForm] = useState(
    state?.search || { city: "Almaty", check_in: isoDate(1), check_out: isoDate(3), room_type: "", max_price: "" },
  );
  const [results, setResults] = useState(null);
  const [searched, setSearched] = useState(form);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [bookingId, setBookingId] = useState(null);

  const run = async (criteria, offset = 0) => {
    setBusy(true);
    setError("");
    try {
      const data = await api("/rooms/search", { params: { ...criteria, limit: PAGE_SIZE, offset } });
      setSearched(criteria);
      setResults((previous) => (offset && previous ? { ...data, rooms: [...previous.rooms, ...data.rooms] } : data));
    } catch (e) {
      setError(e.message);
      if (!offset) setResults(null);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    api("/cities").then(setCities).catch(() => {});
    run(form);
    // Only the first load searches automatically.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (key) => (e) => {
    const value = e.target.value;
    setForm((current) => {
      const next = { ...current, [key]: value };
      // Keep check-out after check-in when the check-in date moves forward.
      if (key === "check_in" && next.check_out <= value) {
        const d = new Date(`${value}T00:00:00`);
        d.setDate(d.getDate() + 1);
        next.check_out = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      }
      return next;
    });
  };

  const book = async (room) => {
    if (!user) {
      navigate("/login", { state: { returnTo: "/", search: searched } });
      return;
    }
    setBookingId(room.id);
    setNotice("");
    setError("");
    try {
      await api("/reservations", {
        method: "POST",
        body: { room_id: room.id, check_in: searched.check_in, check_out: searched.check_out },
      });
      navigate("/bookings", { state: { justBooked: true } });
    } catch (e) {
      setNotice(e.message);
      // Someone may have taken this room, so show what's still free.
      if (e.status === 409) run(searched);
    } finally {
      setBookingId(null);
    }
  };

  const nights = results
    ? Math.round((new Date(searched.check_out) - new Date(searched.check_in)) / 86400000)
    : 0;

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <h1>Find a room for your dates</h1>
          <form className="search-form" onSubmit={(e) => { e.preventDefault(); setNotice(""); run(form); }}>
            <label>City
              <select value={form.city} onChange={set("city")}>
                <option value="">All cities</option>
                {cities.map((city) => <option key={city}>{city}</option>)}
              </select>
            </label>
            <label>Check-in
              <input type="date" required min={isoDate()} value={form.check_in} onChange={set("check_in")} />
            </label>
            <label>Check-out
              <input type="date" required min={form.check_in} value={form.check_out} onChange={set("check_out")} />
            </label>
            <label>Room type
              <select value={form.room_type} onChange={set("room_type")}>
                <option value="">Any</option>
                {ROOM_TYPES.map((type) => <option key={type} value={type}>{label(type)}</option>)}
              </select>
            </label>
            <label>Max price per night
              <input type="number" min="0" step="1000" placeholder="No limit" value={form.max_price} onChange={set("max_price")} />
            </label>
            <button className="primary" disabled={busy}>{busy ? "Searching…" : "Search"}</button>
          </form>
        </div>
      </section>

      <div className="wrap page">
        {notice && <p className="notice" role="alert">{notice}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        {results && (
          <p className="muted result-count" aria-live="polite">
            {results.total} {results.total === 1 ? "room" : "rooms"} free for {nights} {nights === 1 ? "night" : "nights"}
          </p>
        )}
        {results?.total === 0 && <p className="card center">No rooms are free for these dates. Try other dates or another city.</p>}
        <div className="room-grid">
          {results?.rooms.map((room) => (
            <article className="card room" key={room.id}>
              <div>
                <p className="eyebrow">{label(room.room_type)} room · No. {room.room_number}</p>
                <h2>{room.hotel_name}</h2>
                <p className="muted">{room.address ? `${room.address}, ` : ""}{room.city}</p>
              </div>
              <div className="room-footer">
                <div>
                  <p className="price">{formatMoney(room.total_price)}</p>
                  <p className="muted small">{formatMoney(room.price_per_night)} per night</p>
                </div>
                {user?.kind !== "employee" && (
                  <button className="primary" disabled={bookingId !== null} onClick={() => book(room)}>
                    {bookingId === room.id ? "Booking…" : "Book"}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
        {results && results.rooms.length < results.total && (
          <div className="center load-more">
            <button disabled={busy} onClick={() => run(searched, results.rooms.length)}>
              {busy ? "Loading…" : "Show more rooms"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
