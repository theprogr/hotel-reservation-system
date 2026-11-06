import { useCallback, useEffect, useState } from "react";
import { api, formatDate, formatMoney, isoDate, label } from "../api";
import { useAuth } from "../auth";
import { StatusBadge } from "./MyBookings";

const PAGE_SIZE = 50;

// Loads one page of a list, and re-loads when asked or when filters change.
function useList(path, params = {}) {
  const [rows, setRows] = useState(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const key = JSON.stringify(params);

  const reload = useCallback(() => {
    api(path, { params: { ...JSON.parse(key), limit: PAGE_SIZE, offset } })
      .then((data) => { setRows(data); setError(""); })
      .catch((e) => setError(e.message));
  }, [path, key, offset]);

  useEffect(reload, [reload]);
  useEffect(() => setOffset(0), [key]);
  return { rows, offset, setOffset, error, setError, reload };
}

function Pager({ list }) {
  const { rows, offset, setOffset } = list;
  if (!rows || (offset === 0 && rows.length < PAGE_SIZE)) return null;
  return (
    <div className="pager">
      <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Previous</button>
      <span className="muted small">Showing {rows.length ? offset + 1 : 0}–{offset + rows.length}</span>
      <button disabled={rows.length < PAGE_SIZE} onClick={() => setOffset(offset + PAGE_SIZE)}>Next</button>
    </div>
  );
}

function Table({ list, empty, columns, render }) {
  if (list.error) return <p className="error" role="alert">{list.error}</p>;
  if (!list.rows) return <p className="muted">Loading…</p>;
  if (!list.rows.length) return <p className="card center muted">{empty}</p>;
  return (
    <>
      <div className="table-scroll">
        <table>
          <thead><tr>{columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
          <tbody>{list.rows.map(render)}</tbody>
        </table>
      </div>
      <Pager list={list} />
    </>
  );
}

// Runs a change, shows any error, then refreshes the table.
function useAction(list) {
  const [message, setMessage] = useState("");
  const run = async (promiseFn) => {
    setMessage("");
    try {
      await promiseFn();
      list.reload();
      return true;
    } catch (e) {
      setMessage(e.message);
      return false;
    }
  };
  return [message, run];
}

function Summary() {
  const [data, setData] = useState(null);
  useEffect(() => { api("/staff/summary").then(setData).catch(() => {}); }, []);
  if (!data) return null;
  const items = [
    ["Occupied rooms", `${data.occupied_rooms} / ${data.total_rooms}`],
    ["Arrivals today", data.arrivals_today],
    ["Departures today", data.departures_today],
    ["Open maintenance", data.open_maintenance],
    ...(data.revenue_30_days != null ? [["Revenue, last 30 days", formatMoney(data.revenue_30_days)]] : []),
  ];
  return (
    <div className="stats">
      {items.map(([name, value]) => (
        <div className="stat" key={name}><span className="stat-value">{value}</span><span className="muted small">{name}</span></div>
      ))}
    </div>
  );
}

function Reservations() {
  const [status, setStatus] = useState("");
  const list = useList("/staff/reservations", { status });
  const [message, run] = useAction(list);
  const today = isoDate();
  const setState = (r, next) => run(() => api(`/staff/reservations/${r.id}/status`, { method: "POST", body: { status: next } }));

  return (
    <section>
      <div className="toolbar">
        <label className="inline">Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {["pending", "confirmed", "checked_in", "checked_out", "cancelled", "no_show"].map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
        </label>
      </div>
      {message && <p className="error" role="alert">{message}</p>}
      <Table
        list={list}
        empty="No reservations match."
        columns={["Guest", "Hotel / room", "Stay", "Total", "Status", "Actions"]}
        render={(r) => (
          <tr key={r.id}>
            <td>{r.guest_name}<br /><span className="muted small">{r.guest_email}</span></td>
            <td>{r.hotel_name}<br /><span className="muted small">No. {r.room_number} · {label(r.room_type)}</span></td>
            <td className="nowrap">{formatDate(r.check_in)}<br />{formatDate(r.check_out)}</td>
            <td className="nowrap">{formatMoney(r.total_price)}</td>
            <td><StatusBadge status={r.status} /></td>
            <td className="row-actions">
              {r.status === "pending" && <button onClick={() => run(() => api(`/reservations/${r.id}/pay`, { method: "POST", body: { payment_method: "cash" } }))}>Take cash</button>}
              {r.status === "confirmed" && r.check_in <= today && <button onClick={() => setState(r, "checked_in")}>Check in</button>}
              {r.status === "checked_in" && <button onClick={() => setState(r, "checked_out")}>Check out</button>}
              {["pending", "confirmed"].includes(r.status) && r.check_in <= today && <button onClick={() => setState(r, "no_show")}>No-show</button>}
              {["pending", "confirmed"].includes(r.status) && (
                <button className="danger" onClick={() => { if (window.confirm("Cancel this reservation?")) run(() => api(`/reservations/${r.id}/cancel`, { method: "POST" })); }}>Cancel</button>
              )}
            </td>
          </tr>
        )}
      />
    </section>
  );
}

function HotelSelect({ value, onChange }) {
  const [hotels, setHotels] = useState([]);
  useEffect(() => { api("/hotels").then(setHotels).catch(() => {}); }, []);
  return (
    <label>Hotel
      <select required value={value} onChange={onChange}>
        <option value="">Choose…</option>
        {hotels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
      </select>
    </label>
  );
}

function Rooms({ user }) {
  const list = useList("/staff/rooms");
  const [message, run] = useAction(list);
  const isAdmin = user.access_level === "admin";
  const canEdit = isAdmin || user.access_level === "manager";
  const blank = { hotel_id: "", room_number: "", room_type: "double", price_per_night: "" };
  const [form, setForm] = useState(blank);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const add = async (e) => {
    e.preventDefault();
    const body = { ...form, room_number: Number(form.room_number), hotel_id: form.hotel_id ? Number(form.hotel_id) : null };
    if (await run(() => api("/staff/rooms", { method: "POST", body }))) setForm(blank);
  };
  const editPrice = (room) => {
    const price = window.prompt(`New price per night for room ${room.room_number}:`, room.price_per_night);
    if (price !== null && price !== "") run(() => api(`/staff/rooms/${room.id}`, { method: "PATCH", body: { price_per_night: price } }));
  };

  return (
    <section>
      {canEdit && (
        <form className="card add-form" onSubmit={add}>
          <h2>Add a room</h2>
          <div className="form-row">
            {isAdmin && <HotelSelect value={form.hotel_id} onChange={set("hotel_id")} />}
            <label>Room number<input type="number" min="1" required value={form.room_number} onChange={set("room_number")} /></label>
            <label>Type
              <select value={form.room_type} onChange={set("room_type")}>
                {["single", "double", "twin", "deluxe", "suite"].map((t) => <option key={t} value={t}>{label(t)}</option>)}
              </select>
            </label>
            <label>Price per night<input type="number" min="0" step="500" required value={form.price_per_night} onChange={set("price_per_night")} /></label>
            <button className="primary">Add room</button>
          </div>
        </form>
      )}
      {message && <p className="error" role="alert">{message}</p>}
      <Table
        list={list}
        empty="No rooms yet."
        columns={canEdit ? ["Hotel", "Room", "Type", "Price", "Status", "Actions"] : ["Hotel", "Room", "Type", "Price", "Status"]}
        render={(room) => (
          <tr key={room.id}>
            <td>{room.hotel_name}</td>
            <td>{room.room_number}</td>
            <td>{label(room.room_type)}</td>
            <td className="nowrap">{formatMoney(room.price_per_night)}</td>
            <td><StatusBadge status={room.status} /></td>
            {canEdit && (
              <td className="row-actions">
                <button onClick={() => editPrice(room)}>Edit price</button>
                {room.status === "available" && <button onClick={() => run(() => api(`/staff/rooms/${room.id}`, { method: "PATCH", body: { status: "out_of_service" } }))}>Close</button>}
                {room.status === "out_of_service" && <button onClick={() => run(() => api(`/staff/rooms/${room.id}`, { method: "PATCH", body: { status: "available" } }))}>Reopen</button>}
                <button className="danger" onClick={() => { if (window.confirm(`Delete room ${room.room_number}?`)) run(() => api(`/staff/rooms/${room.id}`, { method: "DELETE" })); }}>Delete</button>
              </td>
            )}
          </tr>
        )}
      />
    </section>
  );
}

function NewTask({ onSubmit }) {
  const [rooms, setRooms] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState({ room_id: "", employee_id: "", task_type: "" });

  useEffect(() => {
    api("/staff/rooms", { params: { limit: 500 } }).then(setRooms).catch(() => {});
    api("/staff/employees", { params: { limit: 500 } }).then(setEmployees).catch(() => {});
  }, []);

  const room = rooms.find((r) => String(r.id) === form.room_id);
  const people = employees.filter((e) => e.access_level === "maintenance" && (!room || e.hotel_id === room.hotel_id));

  return (
    <form
      className="card add-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await onSubmit({ ...form, room_id: Number(form.room_id), employee_id: Number(form.employee_id) });
        if (ok) setForm({ room_id: "", employee_id: "", task_type: "" });
      }}
    >
      <h2>New maintenance task</h2>
      <div className="form-row">
        <label>Room
          <select required value={form.room_id} onChange={(e) => setForm({ ...form, room_id: e.target.value, employee_id: "" })}>
            <option value="">Choose…</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.hotel_name} · No. {r.room_number}</option>)}
          </select>
        </label>
        <label>Assign to
          <select required value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
            <option value="">Choose…</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
          </select>
        </label>
        <label>Task<input required maxLength={100} placeholder="e.g. Fix air conditioner" value={form.task_type} onChange={(e) => setForm({ ...form, task_type: e.target.value })} /></label>
        <button className="primary">Create task</button>
      </div>
      <p className="muted small">The room can't be booked until its open tasks are closed.</p>
    </form>
  );
}

function Maintenance({ user }) {
  const [status, setStatus] = useState("");
  const list = useList("/staff/maintenance", { status });
  const [message, run] = useAction(list);
  const update = (task, next) => run(() => api(`/staff/maintenance/${task.id}`, { method: "PATCH", body: { status: next } }));
  const canCreate = user.access_level !== "maintenance";

  return (
    <section>
      {canCreate && <NewTask onSubmit={(body) => run(() => api("/staff/maintenance", { method: "POST", body }))} />}
      <div className="toolbar">
        <label className="inline">Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {["pending", "in_progress", "completed", "cancelled"].map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
        </label>
      </div>
      {message && <p className="error" role="alert">{message}</p>}
      <Table
        list={list}
        empty="No maintenance tasks here."
        columns={["Task", "Hotel / room", "Assigned to", "Created", "Status", "Actions"]}
        render={(t) => (
          <tr key={t.id}>
            <td>{t.task_type}</td>
            <td>{t.hotel_name}<br /><span className="muted small">No. {t.room_number}</span></td>
            <td>{t.employee_name}</td>
            <td className="nowrap">{formatDate(t.created_at)}</td>
            <td><StatusBadge status={t.status} /></td>
            <td className="row-actions">
              {t.status === "pending" && <button onClick={() => update(t, "in_progress")}>Start</button>}
              {["pending", "in_progress"].includes(t.status) && <button onClick={() => update(t, "completed")}>Complete</button>}
              {["pending", "in_progress"].includes(t.status) && <button className="danger" onClick={() => update(t, "cancelled")}>Cancel</button>}
            </td>
          </tr>
        )}
      />
    </section>
  );
}

function Payments() {
  const list = useList("/staff/payments");
  return (
    <Table
      list={list}
      empty="No payments yet."
      columns={["Date", "Guest", "Hotel / room", "Method", "Amount", "Status"]}
      render={(p) => (
        <tr key={p.id}>
          <td className="nowrap">{formatDate(p.payment_date)}</td>
          <td>{p.guest_name}</td>
          <td>{p.hotel_name}<br /><span className="muted small">No. {p.room_number}</span></td>
          <td>{label(p.payment_method)}</td>
          <td className="nowrap">{formatMoney(p.amount)}</td>
          <td><StatusBadge status={p.status} /></td>
        </tr>
      )}
    />
  );
}

function Guests() {
  const list = useList("/staff/guests");
  return (
    <Table
      list={list}
      empty="No guests have booked here yet."
      columns={["Name", "Email", "Phone", "Stays"]}
      render={(g) => (
        <tr key={g.id}><td>{g.name}</td><td>{g.email}</td><td>{g.phone || "—"}</td><td>{g.stays}</td></tr>
      )}
    />
  );
}

function Employees({ user }) {
  const list = useList("/staff/employees");
  const [message, run] = useAction(list);
  const isAdmin = user.access_level === "admin";
  const canEdit = isAdmin || user.access_level === "manager";
  const [roles, setRoles] = useState([]);
  const blank = { hotel_id: "", role_id: "", first_name: "", last_name: "", email: "", password: "" };
  const [form, setForm] = useState(blank);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  useEffect(() => {
    if (canEdit) api("/staff/roles").then(setRoles).catch(() => {});
  }, [canEdit]);

  // Managers can't assign manager or admin roles, so those aren't offered.
  const assignable = roles.filter((r) => isAdmin || !["admin", "manager"].includes(r.access_level));
  const add = async (e) => {
    e.preventDefault();
    const body = { ...form, role_id: Number(form.role_id), hotel_id: form.hotel_id ? Number(form.hotel_id) : null };
    if (await run(() => api("/staff/employees", { method: "POST", body }))) setForm(blank);
  };

  return (
    <section>
      {canEdit && (
        <form className="card add-form" onSubmit={add}>
          <h2>Add an employee</h2>
          <div className="form-row">
            {isAdmin && <HotelSelect value={form.hotel_id} onChange={set("hotel_id")} />}
            <label>Role
              <select required value={form.role_id} onChange={set("role_id")}>
                <option value="">Choose…</option>
                {assignable.map((r) => <option key={r.id} value={r.id}>{r.role_name}</option>)}
              </select>
            </label>
            <label>First name<input required maxLength={100} value={form.first_name} onChange={set("first_name")} /></label>
            <label>Last name<input required maxLength={100} value={form.last_name} onChange={set("last_name")} /></label>
            <label>Email<input type="email" required autoComplete="off" value={form.email} onChange={set("email")} /></label>
            <label>Temporary password<input type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={form.password} onChange={set("password")} /></label>
            <button className="primary">Add employee</button>
          </div>
        </form>
      )}
      {message && <p className="error" role="alert">{message}</p>}
      <Table
        list={list}
        empty="No employees yet."
        columns={canEdit ? ["Name", "Role", "Hotel", "Email", "Salary", "Actions"] : ["Name", "Role", "Hotel", "Email"]}
        render={(e) => (
          <tr key={e.id}>
            <td>{e.first_name} {e.last_name}</td>
            <td>{e.role_name}</td>
            <td>{e.hotel_name}</td>
            <td>{e.email}</td>
            {canEdit && <td className="nowrap">{e.salary != null ? formatMoney(e.salary) : "—"}</td>}
            {canEdit && (
              <td className="row-actions">
                {e.id !== user.id && (isAdmin || !["admin", "manager"].includes(e.access_level)) && (
                  <button className="danger" onClick={() => { if (window.confirm(`Delete ${e.first_name} ${e.last_name}?`)) run(() => api(`/staff/employees/${e.id}`, { method: "DELETE" })); }}>Delete</button>
                )}
              </td>
            )}
          </tr>
        )}
      />
    </section>
  );
}

function Hotels() {
  const list = useList("/admin/hotels");
  const [message, run] = useAction(list);
  const blank = { name: "", city: "", address: "", phone: "" };
  const [form, setForm] = useState(blank);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const add = async (e) => {
    e.preventDefault();
    if (await run(() => api("/admin/hotels", { method: "POST", body: { ...form, address: form.address || null, phone: form.phone || null } }))) setForm(blank);
  };
  return (
    <section>
      <form className="card add-form" onSubmit={add}>
        <h2>Add a hotel</h2>
        <div className="form-row">
          <label>Name<input required maxLength={255} value={form.name} onChange={set("name")} /></label>
          <label>City<input required maxLength={100} value={form.city} onChange={set("city")} /></label>
          <label>Address<input maxLength={255} value={form.address} onChange={set("address")} /></label>
          <label>Phone<input maxLength={20} value={form.phone} onChange={set("phone")} /></label>
          <button className="primary">Add hotel</button>
        </div>
      </form>
      {message && <p className="error" role="alert">{message}</p>}
      <Table
        list={list}
        empty="No hotels yet."
        columns={["Name", "City", "Address", "Phone", "Actions"]}
        render={(h) => (
          <tr key={h.id}>
            <td>{h.name}</td><td>{h.city}</td><td>{h.address || "—"}</td><td className="nowrap">{h.phone || "—"}</td>
            <td className="row-actions">
              <button className="danger" onClick={() => { if (window.confirm(`Delete ${h.name}?`)) run(() => api(`/admin/hotels/${h.id}`, { method: "DELETE" })); }}>Delete</button>
            </td>
          </tr>
        )}
      />
    </section>
  );
}

function Roles() {
  const list = useList("/admin/roles");
  const [message, run] = useAction(list);
  const blank = { role_name: "", description: "", access_level: "staff" };
  const [form, setForm] = useState(blank);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const add = async (e) => {
    e.preventDefault();
    if (await run(() => api("/admin/roles", { method: "POST", body: { ...form, description: form.description || null } }))) setForm(blank);
  };
  return (
    <section>
      <form className="card add-form" onSubmit={add}>
        <h2>Add a role</h2>
        <div className="form-row">
          <label>Name<input required maxLength={100} value={form.role_name} onChange={set("role_name")} /></label>
          <label>Description<input maxLength={255} value={form.description} onChange={set("description")} /></label>
          <label>Access
            <select value={form.access_level} onChange={set("access_level")}>
              {["staff", "maintenance", "front_desk", "manager", "admin"].map((a) => <option key={a} value={a}>{label(a)}</option>)}
            </select>
          </label>
          <button className="primary">Add role</button>
        </div>
      </form>
      {message && <p className="error" role="alert">{message}</p>}
      <Table
        list={list}
        empty="No roles yet."
        columns={["Role", "Description", "Access", "Actions"]}
        render={(r) => (
          <tr key={r.id}>
            <td>{r.role_name}</td><td>{r.description || "—"}</td><td>{label(r.access_level)}</td>
            <td className="row-actions">
              <button className="danger" onClick={() => { if (window.confirm(`Delete ${r.role_name}?`)) run(() => api(`/admin/roles/${r.id}`, { method: "DELETE" })); }}>Delete</button>
            </td>
          </tr>
        )}
      />
    </section>
  );
}

const TABS = [
  { id: "reservations", name: "Reservations", levels: ["admin", "manager", "front_desk"], view: Reservations },
  { id: "rooms", name: "Rooms", levels: ["admin", "manager", "front_desk", "maintenance"], view: Rooms },
  { id: "maintenance", name: "Maintenance", levels: ["admin", "manager", "front_desk", "maintenance"], view: Maintenance },
  { id: "payments", name: "Payments", levels: ["admin", "manager", "front_desk"], view: Payments },
  { id: "guests", name: "Guests", levels: ["admin", "manager", "front_desk"], view: Guests },
  { id: "employees", name: "Employees", levels: ["admin", "manager", "front_desk"], view: Employees },
  { id: "hotels", name: "Hotels", levels: ["admin"], view: Hotels },
  { id: "roles", name: "Roles", levels: ["admin"], view: Roles },
];

export default function Staff() {
  const { user } = useAuth();
  const tabs = TABS.filter((t) => t.levels.includes(user.access_level));
  const [active, setActive] = useState(tabs[0]?.id);
  const tab = tabs.find((t) => t.id === active);
  const View = tab?.view;

  return (
    <div className="wrap page">
      <div className="staff-head">
        <h1>Staff dashboard</h1>
        <p className="muted">{user.name} · {user.role_name}</p>
      </div>
      {tabs.length === 0 ? (
        <p className="card center">Your role has no dashboard access. Please ask a manager if you need it.</p>
      ) : (
        <>
          <Summary />
          <div className="tabs" role="tablist" aria-label="Dashboard sections">
            {tabs.map((t) => (
              <button key={t.id} role="tab" aria-selected={t.id === active} className={t.id === active ? "tab active" : "tab"} onClick={() => setActive(t.id)}>
                {t.name}
              </button>
            ))}
          </div>
          <View user={user} />
        </>
      )}
    </div>
  );
}
