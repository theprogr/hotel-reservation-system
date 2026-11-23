import { useEffect, useRef, useState } from "react";
import { createSearchParams, useNavigate } from "react-router-dom";
import { addDays, isoDate, plural } from "../api";
import DateRangePicker from "./DateRangePicker";
import DestinationPicker from "./DestinationPicker";
import usePopover from "./usePopover";

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
  const button = useRef(null);
  usePopover(box, open, setOpen, () => button.current?.focus());

  return (
    <div className="search-field guest-field" ref={box}>
      <span className="field-icon" aria-hidden="true">👥</span>
      <button type="button" ref={button} className="field-button" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)}>
        <span className="field-label">Guests</span>
        <span className="field-value">{plural(guests, "guest")} · 1 room</span>
      </button>
      <span className="chevron" aria-hidden="true">▾</span>
      {open && (
        <div className="popover guest-popover" role="dialog" aria-label="Choose the number of guests">
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

  useEffect(() => { if (initial) setForm(initial); }, [initial?.city, initial?.check_in, initial?.check_out, initial?.guests]);

  const set = (key, value) =>
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "check_in" && next.check_out <= value) next.check_out = addDays(value, 1);
      return next;
    });

  return (
    <form
      className={compact ? "search-bar compact" : "search-bar"}
      role="search"
      onSubmit={(e) => { e.preventDefault(); navigate(searchLink(form)); }}
    >
      <DestinationPicker value={form.city} onChange={(city) => set("city", city)} />
      <DateRangePicker
        checkIn={form.check_in}
        checkOut={form.check_out}
        onChange={(check_in, check_out) => setForm((f) => ({ ...f, check_in, check_out }))}
      />
      <GuestPicker guests={form.guests} onChange={(n) => set("guests", n)} />
      <button className="search-button">Search</button>
    </form>
  );
}
