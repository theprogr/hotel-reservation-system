import { useEffect, useRef, useState } from "react";
import { addDays, isoDate, nightsBetween, plural } from "../api";
import usePopover from "./usePopover";

const MAX_NIGHTS = 60;
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const monthStart = (iso) => `${iso.slice(0, 7)}-01`;
function addMonths(iso, n) {
  const [y, m] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}
const monthName = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const shortDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const fullDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

// The days to draw for one month, padded so weeks start on Monday.
function monthDays(first) {
  const offset = (new Date(`${first}T00:00:00`).getDay() + 6) % 7;
  const days = Array(offset).fill(null);
  for (let d = first; d.slice(0, 7) === first.slice(0, 7); d = addDays(d, 1)) days.push(d);
  return days;
}

function Month({ first, start, end, hover, onPick, onHover, focusDay, setFocusDay }) {
  const today = isoDate();
  const rangeEnd = end || (start && hover && hover > start ? hover : null);
  const maxOut = start && !end ? addDays(start, MAX_NIGHTS) : null;

  return (
    <div className="cal-month">
      <p className="cal-title">{monthName(first)}</p>
      <div className="cal-grid" role="grid" aria-label={monthName(first)}>
        {WEEKDAYS.map((w) => <span key={w} className="cal-weekday" aria-hidden="true">{w}</span>)}
        {monthDays(first).map((day, i) => {
          if (!day) return <span key={`blank-${i}`} />;
          const past = day < today;
          const tooLong = maxOut && day > maxOut;
          const isStart = day === start;
          const isEnd = day === rangeEnd;
          const inRange = start && rangeEnd && day > start && day < rangeEnd;
          const cls = ["cal-day", isStart && "start", isEnd && "end", inRange && "in-range",
            day === today && "today", rangeEnd && isStart && "has-range"].filter(Boolean).join(" ");
          return (
            <button
              key={day}
              type="button"
              className={cls}
              disabled={past || tooLong}
              aria-pressed={isStart || isEnd}
              aria-label={`${fullDate(day)}${isStart ? ", check-in" : ""}${isEnd ? ", check-out" : ""}`}
              tabIndex={day === focusDay ? 0 : -1}
              data-day={day}
              onClick={() => onPick(day)}
              onMouseEnter={() => onHover(day)}
              onFocus={() => { setFocusDay(day); onHover(day); }}
            >
              {Number(day.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function DateRangePicker({ checkIn, checkOut, onChange }) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(checkIn);
  const [end, setEnd] = useState(checkOut);
  const [hover, setHover] = useState(null);
  const [view, setView] = useState(monthStart(checkIn));
  const [focusDay, setFocusDay] = useState(checkIn);
  const box = useRef(null);
  const button = useRef(null);
  const grid = useRef(null);

  const wantFocus = useRef(false);
  usePopover(box, open, setOpen, () => button.current?.focus());

  useEffect(() => {
    if (!open) return;
    setStart(checkIn);
    setEnd(checkOut);
    setView(monthStart(checkIn));
    setFocusDay(checkIn);
    wantFocus.current = true;
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Move keyboard focus once the day is on screen (after opening, or after arrow keys change month).
  useEffect(() => {
    if (!open || !wantFocus.current) return;
    const el = grid.current?.querySelector(`[data-day="${focusDay}"]`);
    if (el) {
      el.focus();
      wantFocus.current = false;
    }
  }, [open, focusDay, view]);

  const pick = (day) => {
    if (!start || end || day <= start) {
      // Starting a new stay.
      setStart(day);
      setEnd(null);
    } else {
      setEnd(day);
      onChange(start, day);
      setTimeout(() => { setOpen(false); button.current?.focus(); }, 180);
    }
  };

  // Arrow keys move between days, like a printed calendar.
  const onKey = (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!step || !focusDay) return;
    e.preventDefault();
    const next = addDays(focusDay, step);
    if (next < isoDate()) return;
    if (next < view) setView(addMonths(view, -1));
    if (next >= addMonths(view, 2)) setView(addMonths(view, 1));
    wantFocus.current = true;
    setFocusDay(next);
  };

  const nights = start && end ? nightsBetween(start, end) : 0;
  const canGoBack = view > monthStart(isoDate());

  return (
    <div className="search-field date-field" ref={box}>
      <span className="field-icon" aria-hidden="true">📅</span>
      <button type="button" ref={button} className="field-button date-button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="date-part">
          <span className="field-label">Check-in</span>
          <span className="field-value">{shortDate(checkIn)}</span>
        </span>
        <span className="date-arrow" aria-hidden="true">→</span>
        <span className="date-part">
          <span className="field-label">Check-out · {plural(nightsBetween(checkIn, checkOut), "night")}</span>
          <span className="field-value">{shortDate(checkOut)}</span>
        </span>
      </button>

      {open && (
        <div className="popover cal-popover" role="dialog" aria-label="Choose your dates">
          <div className="cal-head">
            <p className="cal-hint" aria-live="polite">
              {!end ? (start ? `Check-in ${shortDate(start)}. Now choose check-out.` : "Choose check-in") : `${shortDate(start)} → ${shortDate(end)} · ${plural(nights, "night")}`}
            </p>
            <div className="cal-nav">
              <button type="button" aria-label="Previous month" disabled={!canGoBack} onClick={() => setView(addMonths(view, -1))}>‹</button>
              <button type="button" aria-label="Next month" onClick={() => setView(addMonths(view, 1))}>›</button>
            </div>
          </div>
          <div className="cal-months" ref={grid} onKeyDown={onKey} onMouseLeave={() => setHover(null)}>
            {[0, 1].map((n) => (
              <Month key={n} first={addMonths(view, n)} start={start} end={end} hover={hover}
                onPick={pick} onHover={setHover} focusDay={focusDay} setFocusDay={setFocusDay} />
            ))}
          </div>
          <div className="cal-foot">
            <span className="muted small">Stays up to {MAX_NIGHTS} nights</span>
            <div className="cal-actions">
              <button type="button" className="text-button" onClick={() => { setStart(null); setEnd(null); setHover(null); }}>Clear</button>
              <button
                type="button"
                className="primary"
                disabled={!start || !end}
                onClick={() => { onChange(start, end); setOpen(false); button.current?.focus(); }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
