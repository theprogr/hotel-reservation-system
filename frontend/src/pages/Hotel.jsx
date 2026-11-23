import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, formatDate, formatMoney, label, nightsBetween, plural, ROOM_INFO } from "../api";
import { useAuth } from "../auth";
import { HotelArt } from "../components/Art";
import Photo, { cityPhoto, roomPhoto } from "../components/Photo";
import SearchBar, { searchFromParams, searchLink } from "../components/SearchBar";
import Stars from "../components/Stars";

export default function Hotel() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const search = useMemo(() => searchFromParams(params), [params]);
  const navigate = useNavigate();
  const { user } = useAuth();
  const [hotel, setHotel] = useState(null);
  const [rooms, setRooms] = useState(null);
  const [error, setError] = useState("");
  const nights = nightsBetween(search.check_in, search.check_out);

  useEffect(() => {
    api(`/hotels/${id}`).then(setHotel).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    setRooms(null);
    api(`/hotels/${id}/availability`, { params: { check_in: search.check_in, check_out: search.check_out, guests: search.guests } })
      .then(setRooms)
      .catch((e) => setError(e.message));
  }, [id, search.check_in, search.check_out, search.guests]);

  if (error && !hotel) return <div className="wrap page-body"><p className="error" role="alert">{error}</p></div>;
  if (!hotel) return <div className="wrap page-body"><p className="muted">Loading…</p></div>;

  const reserve = (room) => {
    navigate("/book", { state: { hotel, room, search } });
  };

  return (
    <>
      <div className="search-strip">
        <div className="wrap"><SearchBar initial={{ ...search, city: hotel.city }} compact /></div>
      </div>
      <div className="wrap page-body">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link to="/">Home</Link><span aria-hidden="true">›</span>
          <Link to={searchLink({ ...search, city: hotel.city })}>{hotel.city}</Link><span aria-hidden="true">›</span>
          <span>{hotel.name}</span>
        </nav>

        <header className="hotel-head">
          <div>
            <div className="tag-row"><span className="tag">Hotel</span><Stars count={hotel.stars} /></div>
            <h1>{hotel.name}</h1>
            <p className="muted">📍 {hotel.address ? `${hotel.address}, ` : ""}{hotel.city}{hotel.phone ? ` · ${hotel.phone}` : ""}</p>
          </div>
          <a href="#rooms" className="button primary">Reserve</a>
        </header>

        <div className="gallery">
          <Photo photo={cityPhoto(hotel.city, hotel.id)} alt={`${hotel.city}, Kazakhstan`} label={`${hotel.city}, Kazakhstan`}
            className="gallery-main" sizes="(max-width: 560px) 100vw, 66vw" fallback={<HotelArt hotel={hotel} className="gallery-main" />} />
          {[0, 1].map((n) => {
            const type = hotel.room_types[n % hotel.room_types.length]?.room_type;
            return (
              <Photo key={n} photo={roomPhoto(type, hotel.id + n)} alt={`Example of a ${type} room`} label={`Example ${type} room`}
                width={500} sizes="33vw" fallback={<HotelArt hotel={{ ...hotel, id: hotel.id + n * 100 }} variant="room" />} />
            );
          })}
        </div>
        <p className="muted small photo-note">City photo shows {hotel.city}. Room photos are examples from other hotels. <Link to="/credits">Photo credits</Link></p>

        <div className="hotel-info">
          <section>
            <h2>About this hotel</h2>
            <p>{hotel.description}</p>
            <h3>Room types</h3>
            <ul className="room-type-list">
              {hotel.room_types.map((t) => (
                <li key={t.room_type}>
                  <strong>{label(t.room_type)}</strong> · sleeps {t.sleeps} · {ROOM_INFO[t.room_type]?.beds} · from {formatMoney(t.from_price)}
                </li>
              ))}
            </ul>
          </section>
          <aside className="card stay-box">
            <h3>Your stay</h3>
            <p><strong>{formatDate(search.check_in)}</strong> → <strong>{formatDate(search.check_out)}</strong></p>
            <p className="muted">{plural(nights, "night")}, {plural(search.guests, "guest")}</p>
            <p className="muted small">Change dates or guests in the search bar above.</p>
          </aside>
        </div>

        <section id="rooms">
          <h2>Availability</h2>
          {rooms === null && <p className="muted">Checking free rooms…</p>}
          {rooms?.length === 0 && (
            <div className="card center empty">
              <p>No rooms here sleep {plural(search.guests, "guest")} on these dates.</p>
              <Link to={searchLink({ ...search, city: hotel.city })}>See other hotels in {hotel.city}</Link>
            </div>
          )}
          {rooms?.length > 0 && (
            <div className="table-scroll">
              <table className="availability">
                <thead>
                  <tr><th scope="col">Room type</th><th scope="col">Sleeps</th><th scope="col">Price for {plural(nights, "night")}</th><th scope="col"><span className="visually-hidden">Reserve</span></th></tr>
                </thead>
                <tbody>
                  {rooms.map((room) => (
                    <tr key={room.id}>
                      <td>
                        <strong className="room-name">{label(room.room_type)} room</strong>
                        <span className="muted small">No. {room.room_number} · {ROOM_INFO[room.room_type]?.beds} · {ROOM_INFO[room.room_type]?.size}</span>
                        <span className="perk small">✓ Free cancellation before check-in</span>
                      </td>
                      <td aria-label={`Sleeps ${room.capacity}`}>{"👤".repeat(room.capacity)}</td>
                      <td>
                        <strong>{formatMoney(room.total_price)}</strong>
                        <span className="muted small">{formatMoney(room.price_per_night)} per night</span>
                      </td>
                      <td>
                        {user?.kind === "employee" ? (
                          <span className="muted small">Guests only</span>
                        ) : (
                          <button className="primary" onClick={() => reserve(room)}>Reserve</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
