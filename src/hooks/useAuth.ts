export type Role = "admin" | "viewer";

export function useAuth() {
  // In browser/local mode, fallback to configurable or session identity
  return {
    user: { id: "admin-session", email: "admin@w.com" },
    roles: ["admin" as Role],
    isAdmin: true,
    loading: false,
  };
}
