import { useEffect, useId, useMemo, useRef, useState } from "react";
import { api, formatMoney, plural } from "../api";
import usePopover from "./usePopover";

// A searchable city list. Each option shows how many hotels the city has and its lowest price.
export default function DestinationPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cities, setCities] = useState([]);
  const [active, setActive] = useState(0);
  const box = useRef(null);
  const button = useRef(null);
  const input = useRef(null);
  const listId = useId();

  useEffect(() => { api("/destinations").then(setCities).catch(() => {}); }, []);
  usePopover(box, open, setOpen, () => button.current?.focus());

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = [...cities].sort((a, b) => a.city.localeCompare(b.city)).filter((c) => c.city.toLowerCase().includes(q));
    return q ? matches : [{ city: "", hotels: cities.reduce((n, c) => n + c.hotels, 0) }, ...matches];
  }, [cities, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      input.current?.focus();
    }
  }, [open]);
  useEffect(() => setActive(0), [query]);

  const choose = (city) => {
    onChange(city);
    setOpen(false);
    button.current?.focus();
  };

  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, options.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    if (e.key === "Enter" && options[active]) { e.preventDefault(); choose(options[active].city); }
  };

  return (
    <div className="search-field city-field" ref={box}>
      <span className="field-icon" aria-hidden="true">📍</span>
      <button
        type="button"
        ref={button}
        className="field-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="field-label">Where are you going?</span>
        <span className="field-value">{value || "All of Kazakhstan"}</span>
      </button>
      <span className="chevron" aria-hidden="true">▾</span>

      {open && (
        <div className="popover city-popover">
          <input
            ref={input}
            className="city-search"
            placeholder="Search a city"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={options[active] ? `${listId}-${active}` : undefined}
            aria-label="Search a city"
          />
          <ul className="city-list" role="listbox" id={listId} aria-label="Cities">
            {options.map((c, i) => (
              <li
                key={c.city || "all"}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={value === c.city}
                className={`city-option${i === active ? " active" : ""}${value === c.city ? " selected" : ""}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(c.city)}
              >
                <span className="city-icon" aria-hidden="true">{c.city ? "🏙" : "🇰🇿"}</span>
                <span className="city-text">
                  <span className="city-name">{c.city || "All of Kazakhstan"}</span>
                  <span className="city-meta">
                    {plural(c.hotels, "hotel")}
                    {c.from_price != null && ` · from ${formatMoney(c.from_price)}`}
                  </span>
                </span>
                {value === c.city && <span className="tick" aria-hidden="true">✓</span>}
              </li>
            ))}
            {options.length === 0 && <li className="city-empty">No city matches "{query}"</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
