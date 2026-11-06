const BASE = import.meta.env.VITE_API_URL || "/api";
const TOKEN_KEY = "hotel_token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) =>
  token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY);

function errorMessage(body, status) {
  if (typeof body?.detail === "string") return body.detail;
  if (Array.isArray(body?.detail)) {
    // Pydantic validation errors: show the first one without its "Value error," prefix.
    return String(body.detail[0]?.msg || "Please check the form.").replace(/^Value error, /, "");
  }
  return status >= 500 ? "Something went wrong on the server. Please try again." : "That request didn't work.";
}

export async function api(path, { method = "GET", body, params } = {}) {
  const query = new URLSearchParams(
    Object.entries(params || {}).filter(([, value]) => value !== "" && value != null),
  ).toString();
  const token = getToken();
  let response;
  try {
    response = await fetch(`${BASE}${path}${query ? `?${query}` : ""}`, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Can't reach the server. Is the backend running?");
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(errorMessage(data, response.status));
    error.status = response.status;
    throw error;
  }
  return data;
}

const money = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
export const formatMoney = (value) => `${money.format(Number(value))} ₸`;

// Local dates, because toISOString() would use UTC and can show the wrong day in Kazakhstan.
export function isoDate(daysFromToday = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const formatDate = (value) =>
  new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export const label = (value) => {
  const text = String(value ?? "").replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};
