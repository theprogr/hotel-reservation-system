import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, formatMoney, label, plural, ROOM_INFO } from "../api";
import { HotelArt } from "../components/Art";
import Photo, { hotelPhoto } from "../components/Photo";
import SearchBar, { searchFromParams } from "../components/SearchBar";
import Stars from "../components/Stars";

const PAGE_SIZE = 20;
const ROOM_TYPES = ["single", "double", "twin", "deluxe", "suite"];
const SORTS = [["recommended", "Our top picks"], ["price_low", "Price (lowest first)"], ["price_high", "Price (highest first)"], ["stars", "Stars (highest first)"]];

const BUDGETS = [["", "Any price"], ["25000", "Up to 25,000 ₸"], ["50000", "Up to 50,000 ₸"], ["100000", "Up to 100,000 ₸"]];

function Filters({ params, update }) {
  const stars = (params.get("stars") || "").split(",").filter(Boolean);
  const maxPrice = params.get("max_price") || "";
  const roomType = params.get("room_type") || "";
  const isPreset = BUDGETS.some(([v]) => v === maxPrice);
  const [custom, setCustom] = useState(isPreset ? "" : maxPrice);
  useEffect(() => { if (isPreset) setCustom(""); }, [maxPrice]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleStar = (s) => {
    const next = stars.includes(s) ? stars.filter((x) => x !== s) : [...stars, s];
    update({ stars: next.sort().join(",") });
  };
  const active = stars.length + (maxPrice ? 1 : 0) + (roomType ? 1 : 0);

  return (
    <div className="filters-inner">
      <div className="filter-head">
        <h2 className="filter-title">Filter by</h2>
        {active > 0 && (
          <button type="button" className="text-button" onClick={() => update({ stars: "", max_price: "", room_type: "" })}>
            Clear all ({active})
          </button>
        )}
      </div>

      <fieldset className="filter-group">
        <legend>Budget per night</legend>
        <div className="chip-list">
          {BUDGETS.map(([value, text]) => (
            <button key={text} type="button" className={maxPrice === value ? "chip active" : "chip"} aria-pressed={maxPrice === value}
              onClick={() => update({ max_price: value })}>
              {text}
            </button>
          ))}
        </div>
        <form className="custom-budget" onSubmit={(e) => { e.preventDefault(); update({ max_price: custom }); }}>
          <label className="visually-hidden" htmlFor="custom-budget">Custom maximum price per night in tenge</label>
          <div className={!isPreset && maxPrice ? "money-input active" : "money-input"}>
            <input id="custom-budget" type="number" inputMode="numeric" min="0" step="1000" placeholder="Custom max"
              value={custom} onChange={(e) => setCustom(e.target.value)} />
            <span aria-hidden="true">₸</span>
          </div>
          <button type="submit" disabled={!custom}>Apply</button>
        </form>
      </fieldset>

      <fieldset className="filter-group">
        <legend>Star rating <span className="muted small">(choose any)</span></legend>
        <div className="star-chips">
          {["5", "4", "3", "2", "1"].map((s) => (
            <button key={s} type="button" className={stars.includes(s) ? "chip star-chip active" : "chip star-chip"} aria-pressed={stars.includes(s)}
              aria-label={`${s} stars`} onClick={() => toggleStar(s)}>
              {s}<span aria-hidden="true">★</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="filter-group">
        <legend>Room type</legend>
        <div className="type-options">
          {[["", "Any type", "All rooms"], ...ROOM_TYPES.map((t) => [t, label(t), ROOM_INFO[t].beds])].map(([value, name, beds]) => (
            <button key={name} type="button" className={roomType === value ? "type-option active" : "type-option"} aria-pressed={roomType === value}
              onClick={() => update({ room_type: value })}>
              <span className="type-option-name">{name}</span>
              <span className="type-option-beds">{beds}</span>
              {roomType === value && <span className="tick" aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function ResultCard({ hotel, search, nights }) {
  const link = `/hotels/${hotel.id}?${new URLSearchParams(Object.entries(search).filter(([, v]) => v))}`;
  return (
    <article className="result-card">
      <Link to={link} className="result-art" tabIndex={-1} aria-hidden="true">
        <Photo photo={hotelPhoto(hotel)} alt="" label="Example room" width={500} sizes="220px" fallback={<HotelArt hotel={hotel} />} />
      </Link>
      <div className="result-main">
        <div className="result-title">
          <h3><Link to={link}>{hotel.name}</Link></h3>
          <Stars count={hotel.stars} />
        </div>
        <p className="small"><Link to={link} className="city-link">{hotel.city}</Link>{hotel.address ? ` · ${hotel.address}` : ""}</p>
        <p className="card-description clamp">{hotel.description}</p>
        <p className="small">
          Room types available: {hotel.room_types.map(label).join(", ")}
        </p>
        {hotel.free_rooms <= 2 && <p className="scarcity">Only {plural(hotel.free_rooms, "room")} left for your dates</p>}
      </div>
      <div className="result-price">
        <p className="muted small">{plural(nights, "night")}, {plural(search.guests, "guest")}</p>
        <p className="price-big">{formatMoney(hotel.from_total)}</p>
        <p className="muted small">from {formatMoney(hotel.from_price)} per night</p>
        <Link to={link} className="button primary">See availability</Link>
      </div>
    </article>
  );
}

export default function SearchResults() {
  const [params, setParams] = useSearchParams();
  const search = useMemo(() => searchFromParams(params), [params]);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const key = params.toString();

  const filters = {
    stars: params.get("stars") || "",
    room_type: params.get("room_type") || "",
    max_price: params.get("max_price") || "",
    sort: params.get("sort") || "recommended",
  };

  const load = async (offset = 0) => {
    setBusy(true);
    setError("");
    try {
      const data = await api("/hotels/search", { params: { ...search, ...filters, limit: PAGE_SIZE, offset } });
      setResults((prev) => (offset && prev ? { ...data, hotels: [...prev.hotels, ...data.hotels] } : data));
    } catch (e) {
      setError(e.message);
      if (!offset) setResults(null);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { load(0); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (changes) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next);
  };

  const place = search.city || "Kazakhstan";

  return (
    <>
      <div className="search-strip">
        <div className="wrap"><SearchBar initial={search} compact /></div>
      </div>
      <div className="wrap page-body">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link to="/">Home</Link><span aria-hidden="true">›</span>
          {search.city ? <><Link to="/search">Kazakhstan</Link><span aria-hidden="true">›</span><span>{search.city}</span></> : <span>Kazakhstan</span>}
          <span aria-hidden="true">›</span><span>Search results</span>
        </nav>

        <div className="results-layout">
          <aside className={showFilters ? "filters open" : "filters"} aria-label="Filters">
            <Filters params={params} update={update} />
          </aside>

          <section className="results">
            <div className="results-head">
              <h1 className="results-title" aria-live="polite">
                {results ? `${place}: ${plural(results.total, "hotel")} found` : `Searching ${place}…`}
              </h1>
              <div className="results-tools">
                <button type="button" className="filter-toggle" aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}>
                  {showFilters ? "Hide filters" : "Filters"}
                </button>
                <label className="inline">Sort by
                  <select value={filters.sort} onChange={(e) => update({ sort: e.target.value === "recommended" ? "" : e.target.value })}>
                    {SORTS.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
                  </select>
                </label>
              </div>
            </div>

            {error && <p className="error" role="alert">{error}</p>}
            {results?.total === 0 && (
              <div className="card center empty">
                <h2>No hotels match</h2>
                <p className="muted">Try other dates, fewer guests or fewer filters.</p>
              </div>
            )}
            <div className="stack">
              {results?.hotels.map((h) => <ResultCard key={h.id} hotel={h} search={search} nights={results.nights} />)}
            </div>
            {results && results.hotels.length < results.total && (
              <div className="center load-more">
                <button disabled={busy} onClick={() => load(results.hotels.length)}>{busy ? "Loading…" : "Show more hotels"}</button>
              </div>
            )}
            {!results && busy && <p className="muted">Loading…</p>}
          </section>
        </div>
      </div>
    </>
  );
}
