import { Link } from "react-router-dom";
import { searchLink, defaultSearch } from "./SearchBar";

const CITIES = ["Almaty", "Astana", "Shymkent", "Aktau", "Turkistan"];

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap footer-grid">
        <div>
          <p className="brand footer-brand">Qonaq</p>
          <p className="muted small">Hotel stays across Kazakhstan. A student database project: payments are simulated.</p>
        </div>
        <nav aria-label="Popular cities">
          <p className="footer-title">Popular cities</p>
          <ul>
            {CITIES.map((city) => (
              <li key={city}><Link to={searchLink({ ...defaultSearch(), city })}>Hotels in {city}</Link></li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Your account">
          <p className="footer-title">Your account</p>
          <ul>
            <li><Link to="/bookings">My bookings</Link></li>
            <li><Link to="/register">Create an account</Link></li>
            <li><Link to="/login">Staff log in</Link></li>
          </ul>
        </nav>
        <div>
          <p className="footer-title">About this project</p>
          <ul>
            <li><a href="https://github.com/theprogr/hotel-reservation-system">Source code on GitHub</a></li>
            <li className="muted small">PostgreSQL · FastAPI · React</li>
          </ul>
        </div>
      </div>
      <div className="wrap footer-bottom muted small">Prices in Kazakhstani tenge (₸). All hotels and bookings are sample data.</div>
    </footer>
  );
}
