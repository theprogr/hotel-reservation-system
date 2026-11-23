import { useEffect, useRef, useState } from "react";
import { createSearchParams, useNavigate } from "react-router-dom";
import { addDays, api, isoDate, nightsBetween, plural } from "../api";

export const MAX_GUESTS = 8;

export function defaultSearch() {
  return { city: "", check_in: isoDate(1), check_out: isoDate(3), guests: 2 };
}

// Reads a search from the address bar, falling back to sensible defaults.
export function searchFromParams(params) {
  const base = defaultSearch();
  const checkIn = params.get("check_in") || base.check_in;
  let checkOut = params.get("check_out") || base.check_out;
  if (checkOut <= checkIn) checkOut = addDays(checkIn, 1);
  const guests = Math.min(MAX_GUESTS, Math.max(1, Number(params.get("guests")) || base.guests));
  return { city: params.get("city") || "", check_in: checkIn, check_out: checkOut, guests };
}

export function searchLink(search, extra = {}) {
  const params = Object.fromEntries(
    Object.entries({ ...search, ...extra }).filter(([, v]) => v !== "" && v != null),
  );
  return `/search?${createSearchParams(params)}`;
}

function GuestPicker({ guests, onChange }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const escape = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div className="search-field guest-field" ref={box}>
      <span className="field-icon" aria-hidden="true">👤</span>
      <button type="button" className="guest-toggle" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)}>
        <span className="field-label">Guests</span>
        <span className="field-value">{plural(guests, "guest")} · 1 room</span>
      </button>
      {open && (
        <div className="guest-popover" role="dialog" aria-label="Choose the number of guests">
          <div className="stepper-row">
            <span>Guests</span>
            <div className="stepper">
              <button type="button" aria-label="Fewer guests" disabled={guests <= 1} onClick={() => onChange(guests - 1)}>−</button>
              <output aria-live="polite">{guests}</output>
              <button type="button" aria-label="More guests" disabled={guests >= MAX_GUESTS} onClick={() => onChange(guests + 1)}>+</button>
            </div>
          </div>
          <p className="muted small">We only show rooms that sleep everyone in your group.</p>
          <button type="button" className="primary block" onClick={() => setOpen(false)}>Done</button>
        </div>
      )}
    </div>
  );
}

export default function SearchBar({ initial, compact = false }) {
  const navigate = useNavigate();
  const [form, setForm] = useState(initial || defaultSearch());
  const [cities, setCities] = useState([]);

  useEffect(() => { api("/cities").then(setCities).catch(() => {}); }, []);
  useEffect(() => { if (initial) setForm(initial); }, [initial?.city, initial?.check_in, initial?.check_out, initial?.guests]);

  const set = (key, value) =>
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "check_in" && next.check_out <= value) next.check_out = addDays(value, 1);
      return next;
    });

  const nights = nightsBetween(form.check_in, form.check_out);

  return (
    <form
      className={compact ? "search-bar compact" : "search-bar"}
      role="search"
      onSubmit={(e) => { e.preventDefault(); navigate(searchLink(form)); }}
    >
      <label className="search-field city-field">
        <span className="field-icon" aria-hidden="true">🛏</span>
        <span className="field-text">
          <span className="field-label">Where are you going?</span>
          <select value={form.city} onChange={(e) => set("city", e.target.value)}>
            <option value="">All of Kazakhstan</option>
            {cities.map((city) => <option key={city}>{city}</option>)}
          </select>
        </span>
      </label>
      <div className="search-field date-field">
        <span className="field-icon" aria-hidden="true">📅</span>
        <label className="field-text">
          <span className="field-label">Check-in</span>
          <input type="date" required min={isoDate()} value={form.check_in} onChange={(e) => set("check_in", e.target.value)} />
        </label>
        <span className="date-dash" aria-hidden="true">—</span>
        <label className="field-text">
          <span className="field-label">Check-out · {plural(nights, "night")}</span>
          <input type="date" required min={addDays(form.check_in, 1)} max={addDays(form.check_in, 60)} value={form.check_out} onChange={(e) => set("check_out", e.target.value)} />
        </label>
      </div>
      <GuestPicker guests={form.guests} onChange={(n) => set("guests", n)} />
      <button className="search-button">Search</button>
    </form>
  );
}
