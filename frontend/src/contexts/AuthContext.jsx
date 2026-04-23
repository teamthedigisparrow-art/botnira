import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../lib/api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [vendor, setVendor] = useState(null);
  const [access, setAccess] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadMe = async () => {
    const token = localStorage.getItem("botnira_token");
    if (!token) { setLoading(false); return; }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data.user);
      setVendor(data.vendor);
      setAccess(data.access);
    } catch {
      localStorage.removeItem("botnira_token");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadMe(); }, []);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("botnira_token", data.token);
    await loadMe();
    return data;
  };

  const signup = async (payload) => {
    const { data } = await api.post("/auth/signup", payload);
    localStorage.setItem("botnira_token", data.token);
    await loadMe();
    return data;
  };

  const logout = () => {
    localStorage.removeItem("botnira_token");
    setUser(null); setVendor(null); setAccess(null);
  };

  return (
    <AuthCtx.Provider value={{ user, vendor, access, loading, login, signup, logout, reload: loadMe }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
