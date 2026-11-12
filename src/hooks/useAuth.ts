export type Role = "admin" | "viewer";

export function useAuth() {
  return {
    user: { id: "local-admin", email: "admin@replay.local" },
    roles: ["admin" as Role],
    isAdmin: true,
    loading: false,
  };
}
