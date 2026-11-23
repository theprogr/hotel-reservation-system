import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatMoney, label, plural, ROOM_INFO } from "../api";
import { CityArt, HotelArt } from "../components/Art";
import SearchBar, { defaultSearch, searchLink } from "../components/SearchBar";
import Stars from "../components/Stars";

function Carousel({ title, subtitle, children }) {
  const track = useRef(null);
  const scroll = (direction) =>
    track.current?.scrollBy({ left: direction * track.current.clientWidth * 0.8, behavior: "smooth" });
  return (
    <section className="carousel-section">
      <div className="section-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        <div className="carousel-arrows">
          <button type="button" aria-label="Scroll left" onClick={() => scroll(-1)}>‹</button>
          <button type="button" aria-label="Scroll right" onClick={() => scroll(1)}>›</button>
        </div>
      </div>
      <div className="carousel" ref={track}>{children}</div>
    </section>
  );
}

export function HotelCard({ hotel, search }) {
  const [expanded, setExpanded] = useState(false);
  const link = `/hotels/${hotel.id}?${new URLSearchParams(Object.entries(search).filter(([, v]) => v))}`;
  return (
    <article className="hotel-card">
      <Link to={link} tabIndex={-1} aria-hidden="true"><HotelArt hotel={hotel} className="card-art" /></Link>
      <div className="hotel-card-body">
        <h3><Link to={link}>{hotel.name}</Link></h3>
        <p className="muted small">{hotel.city}{hotel.address ? `, ${hotel.address}` : ""}</p>
        <div className="tag-row">
          <span className="tag">Hotel</span>
          <Stars count={hotel.stars} size="small" />
        </div>
        {hotel.description && (
          <>
            <p className={expanded ? "card-description" : "card-description clamp"}>{hotel.description}</p>
            <button type="button" className="text-button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
              {expanded ? "Show less" : "Read more"}
            </button>
          </>
        )}
        {hotel.from_price != null && (
          <p className="from-price">From <strong>{formatMoney(hotel.from_price)}</strong> per night</p>
        )}
      </div>
    </article>
  );
}

const FAQ = [
  ["How do I know a room is really free?",
   "Every search checks the whole stay against existing bookings. The database also refuses a second booking for the same room and dates, even if two people book at the same moment."],
  ["Can I book for a group?",
   "Choose the number of guests in the search bar. Only rooms that sleep your whole group are shown, and the database blocks bookings for more guests than a room sleeps."],
  ["When do I pay?",
   "Your room is held as soon as you book. Pay from My bookings to confirm it. Payments here are simulated, so no real money moves."],
  ["Can I cancel?",
   "Yes, up until the day before check-in, from My bookings. If you've already paid, the payment is refunded automatically."],
];

export default function Home() {
  const [destinations, setDestinations] = useState([]);
  const [almaty, setAlmaty] = useState([]);
  const [astana, setAstana] = useState([]);
  const search = defaultSearch();

  useEffect(() => {
    api("/destinations").then(setDestinations).catch(() => {});
    api("/hotels", { params: { city: "Almaty", limit: 10 } }).then(setAlmaty).catch(() => {});
    api("/hotels", { params: { city: "Astana", limit: 10 } }).then(setAstana).catch(() => {});
  }, []);

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <h1>Find your next stay in Kazakhstan</h1>
          <p className="hero-sub">Search hotels from the Caspian coast to the Altai foothills, and see exactly what's free for your dates.</p>
          <SearchBar initial={search} />
        </div>
      </section>

      <div className="wrap page-body">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link to="/">Home</Link><span aria-hidden="true">›</span><span>Hotels in Kazakhstan</span>
        </nav>

        <Carousel title="Popular destinations" subtitle="Cities where travellers book the most hotels">
          {destinations.map((d) => (
            <Link key={d.city} to={searchLink({ ...search, city: d.city })} className="destination-card">
              <CityArt city={d.city} />
              <span className="destination-name">{d.city}</span>
              <span className="destination-meta">{plural(d.hotels, "hotel")} · from {formatMoney(d.from_price)}</span>
            </Link>
          ))}
        </Carousel>

        {almaty.length > 0 && (
          <Carousel title="Our favourite hotels in Almaty" subtitle="Top-rated stays near the mountains">
            {almaty.map((h) => <HotelCard key={h.id} hotel={h} search={{ ...search, city: "Almaty" }} />)}
          </Carousel>
        )}

        {astana.length > 0 && (
          <Carousel title="Great choices in Astana" subtitle="Stay close to the capital's landmarks">
            {astana.map((h) => <HotelCard key={h.id} hotel={h} search={{ ...search, city: "Astana" }} />)}
          </Carousel>
        )}

        <section>
          <h2>Browse by room type</h2>
          <div className="type-grid">
            {Object.entries(ROOM_INFO).map(([type, info]) => (
              <Link key={type} to={searchLink(search, { room_type: type })} className="type-card">
                <HotelArt hotel={{ id: type.length * 3, city: "Astana", name: label(type) }} variant="room" />
                <span className="type-name">{label(type)}</span>
                <span className="muted small">{info.beds}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="why-grid" aria-label="Why book with Qonaq">
          <div><span className="why-icon" aria-hidden="true">✓</span><h3>No double bookings</h3><p className="muted">The database guarantees every room is booked by one guest at a time.</p></div>
          <div><span className="why-icon" aria-hidden="true">₸</span><h3>Prices in tenge</h3><p className="muted">You see the full price for your stay before you book.</p></div>
          <div><span className="why-icon" aria-hidden="true">↺</span><h3>Free cancellation</h3><p className="muted">Cancel before check-in and any payment is refunded automatically.</p></div>
        </section>

        <section className="faq">
          <h2>Frequently asked questions</h2>
          {FAQ.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </section>
      </div>
    </>
  );
}
