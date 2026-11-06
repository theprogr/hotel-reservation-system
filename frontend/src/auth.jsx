import { createContext, useContext, useEffect, useState } from "react";
import { api, getToken, setToken } from "./api";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  useEffect(() => {
    if (!getToken()) return;
    api("/auth/me")
      .then(setUser)
      .catch((error) => {
        // Only forget the login if the server rejected it, not if it's briefly offline.
        if (error.status === 401) setToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const finishLogin = ({ token, user: account }) => {
    setToken(token);
    setUser(account);
    return account;
  };

  const value = {
    user,
    loading,
    login: async (email, password) =>
      finishLogin(await api("/auth/login", { method: "POST", body: { email, password } })),
    register: async (form) => finishLogin(await api("/auth/register", { method: "POST", body: form })),
    logout: () => {
      setToken(null);
      setUser(null);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
