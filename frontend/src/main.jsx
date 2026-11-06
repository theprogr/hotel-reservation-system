import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { Login, Register } from "./pages/Account";
import MyBookings from "./pages/MyBookings";
import Search from "./pages/Search";
import Staff from "./pages/Staff";
import "./styles.css";

function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <header className="site-header">
      <div className="wrap header-row">
        <Link to="/" className="brand">Hotel Reservation</Link>
        <nav aria-label="Main">
          <NavLink to="/" end>Find a room</NavLink>
          {user?.kind === "guest" && <NavLink to="/bookings">My bookings</NavLink>}
          {user?.kind === "employee" && <NavLink to="/staff">Staff dashboard</NavLink>}
          {user ? (
            <button className="link-button" onClick={() => { logout(); navigate("/"); }}>Log out</button>
          ) : (
            <NavLink to="/login">Log in</NavLink>
          )}
        </nav>
      </div>
    </header>
  );
}

function Protected({ kind, children }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="wrap muted page">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.kind !== kind) return <Navigate to="/" replace />;
  return children;
}

function App() {
  return (
    <>
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<Search />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/bookings" element={<Protected kind="guest"><MyBookings /></Protected>} />
          <Route path="/staff" element={<Protected kind="employee"><Staff /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
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
