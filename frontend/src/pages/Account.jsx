import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

function useAfterLogin() {
  const navigate = useNavigate();
  const { state } = useLocation();
  return (account) => {
    if (account.kind === "employee") navigate("/staff", { replace: true });
    // Coming back to search keeps the dates the guest had already chosen.
    else navigate(state?.returnTo || "/bookings", { replace: true, state: { search: state?.search } });
  };
}

function AccountCard({ title, children, footer }) {
  return (
    <div className="wrap page narrow">
      <h1>{title}</h1>
      <div className="card">{children}</div>
      <p className="muted center">{footer}</p>
    </div>
  );
}

export function Login() {
  const { login } = useAuth();
  const afterLogin = useAfterLogin();
  const { state } = useLocation();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      afterLogin(await login(form.email, form.password));
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <AccountCard
      title="Log in"
      footer={<>New here? <Link to="/register" state={state}>Create a guest account</Link></>}
    >
      <form onSubmit={submit} className="stack">
        <label>Email
          <input type="email" autoComplete="username" required value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label>Password
          <input type="password" autoComplete="current-password" required value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? "Logging in…" : "Log in"}</button>
      </form>
    </AccountCard>
  );
}

export function Register() {
  const { register } = useAuth();
  const afterLogin = useAfterLogin();
  const { state } = useLocation();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      afterLogin(await register({ ...form, phone: form.phone || null }));
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <AccountCard
      title="Create your account"
      footer={<>Already registered? <Link to="/login" state={state}>Log in</Link></>}
    >
      <form onSubmit={submit} className="stack">
        <label>Full name<input required maxLength={255} autoComplete="name" value={form.name} onChange={set("name")} /></label>
        <label>Email<input type="email" required autoComplete="email" value={form.email} onChange={set("email")} /></label>
        <label>Phone (optional)<input type="tel" maxLength={20} autoComplete="tel" value={form.phone} onChange={set("phone")} /></label>
        <label>Password
          <input type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={form.password} onChange={set("password")} />
          <small className="muted">At least 8 characters</small>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
      </form>
    </AccountCard>
  );
}
