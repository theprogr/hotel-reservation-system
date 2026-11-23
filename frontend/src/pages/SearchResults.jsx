import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, formatMoney, label, plural } from "../api";
import { HotelArt } from "../components/Art";
import SearchBar, { searchFromParams } from "../components/SearchBar";
import Stars from "../components/Stars";

const PAGE_SIZE = 20;
const ROOM_TYPES = ["single", "double", "twin", "deluxe", "suite"];
const SORTS = [["recommended", "Our top picks"], ["price_low", "Price (lowest first)"], ["price_high", "Price (highest first)"], ["stars", "Stars (highest first)"]];

function Filters({ params, update }) {
  const stars = (params.get("stars") || "").split(",").filter(Boolean);
  const toggleStar = (s) => {
    const next = stars.includes(s) ? stars.filter((x) => x !== s) : [...stars, s];
    update({ stars: next.sort().join(",") });
  };
  return (
    <div className="filters-inner">
      <h2 className="filter-title">Filter by</h2>
      <fieldset>
        <legend>Your budget per night</legend>
        <label className="inline-input">
          Up to
          <input type="number" min="0" step="5000" placeholder="Any" defaultValue={params.get("max_price") || ""}
            key={params.get("max_price") || "none"}
            onBlur={(e) => update({ max_price: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); update({ max_price: e.target.value }); } }} />
          ₸
        </label>
      </fieldset>
      <fieldset>
        <legend>Star rating</legend>
        {["5", "4", "3", "2", "1"].map((s) => (
          <label key={s} className="check">
            <input type="checkbox" checked={stars.includes(s)} onChange={() => toggleStar(s)} />
            <Stars count={Number(s)} size="small" />
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Room type</legend>
        <label className="check"><input type="radio" name="room_type" checked={!params.get("room_type")} onChange={() => update({ room_type: "" })} /> Any</label>
        {ROOM_TYPES.map((t) => (
          <label key={t} className="check">
            <input type="radio" name="room_type" checked={params.get("room_type") === t} onChange={() => update({ room_type: t })} /> {label(t)}
          </label>
        ))}
      </fieldset>
    </div>
  );
}

function ResultCard({ hotel, search, nights }) {
  const link = `/hotels/${hotel.id}?${new URLSearchParams(Object.entries(search).filter(([, v]) => v))}`;
  return (
    <article className="result-card">
      <Link to={link} className="result-art" tabIndex={-1} aria-hidden="true"><HotelArt hotel={hotel} /></Link>
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
