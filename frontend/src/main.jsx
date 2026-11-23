import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import Footer from "./components/Footer";
import { Login, Register } from "./pages/Account";
import Checkout from "./pages/Checkout";
import Home from "./pages/Home";
import Hotel from "./pages/Hotel";
import MyBookings from "./pages/MyBookings";
import SearchResults from "./pages/SearchResults";
import Staff from "./pages/Staff";
import "./styles.css";

function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <header className="site-header">
      <div className="wrap header-row">
        <Link to="/" className="brand">Qonaq<span className="brand-dot">.kz</span></Link>
        <div className="header-actions">
          <span className="currency" title="Prices are in Kazakhstani tenge">KZT</span>
          {user ? (
            <>
              <span className="hello">Hi, {user.name.split(" ")[0]}</span>
              <button className="header-button" onClick={() => { logout(); navigate("/"); }}>Log out</button>
            </>
          ) : (
            <>
              <Link className="header-button" to="/register">Register</Link>
              <Link className="header-button" to="/login">Log in</Link>
            </>
          )}
        </div>
      </div>
      <nav className="wrap header-tabs" aria-label="Main">
        <NavLink to="/" end className="header-tab">🛏 Stays</NavLink>
        <NavLink to="/search" className="header-tab">🔎 Search hotels</NavLink>
        {user?.kind === "guest" && <NavLink to="/bookings" className="header-tab">🧳 My bookings</NavLink>}
        {user?.kind === "employee" && <NavLink to="/staff" className="header-tab">🗂 Staff dashboard</NavLink>}
      </nav>
    </header>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function Protected({ kind, children }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="wrap muted page-body">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.kind !== kind) return <Navigate to="/" replace />;
  return children;
}

function App() {
  return (
    <>
      <ScrollToTop />
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<SearchResults />} />
          <Route path="/hotels/:id" element={<Hotel />} />
          <Route path="/book" element={<Checkout />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/bookings" element={<Protected kind="guest"><MyBookings /></Protected>} />
          <Route path="/staff" element={<Protected kind="employee"><Staff /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
