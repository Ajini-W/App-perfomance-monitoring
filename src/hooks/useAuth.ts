import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

export type Role = "admin" | "viewer";

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

interface StoredSession {
  user: AuthUser;
  token: string;
}

const STORAGE_KEY = "rc_admin_session";

export function useAuth() {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // App load aagumbothu localStorage-la session iruka nu check pannum
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: StoredSession = JSON.parse(raw);
        if (parsed?.user?.id) {
          setUser(parsed.user);
        }
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setLoading(false);
    }
  }, []);

  // Login successful aana aprum session save panna
  const setSession = (userData: AuthUser, token: string) => {
    const session: StoredSession = { user: userData, token };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    setUser(userData);
  };

  // Logout panna session clear panni login page-ku redirect pannum
  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
    navigate({ to: "/login" });
  };

  const roles: Role[] = user ? [user.role] : [];
  const isAdmin = user?.role === "admin";

  return {
    user,
    roles,
    isAdmin,
    loading,
    setSession,
    logout,
  };
}
