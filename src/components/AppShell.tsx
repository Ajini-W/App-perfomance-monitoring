import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export function AppShell({
  children,
}: {
  children: (auth: ReturnType<typeof useAuth>) => ReactNode;
}) {
  const auth = useAuth();
  const navigate = useNavigate();

  if (auth.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!auth.user) {
    navigate({ to: "/login" });
    return null;
  }

  return (
    <div className="min-h-screen">
      <header className="bg-brand text-sidebar-foreground">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/dashboard" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-primary font-display text-sidebar-primary-foreground">
              R
            </span>
            <span className="font-display text-xl">Replay Console</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-sidebar-foreground/80 sm:inline">
              {auth.user.email} · {auth.roles.join(", ") || "no access"}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                navigate({ to: "/login" });
              }}
            >
              Sign out
            </Button>

          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">
        {auth.roles.length === 0 ? (
          <div className="rounded-xl border bg-card p-8 shadow-card">
            <h2 className="text-2xl">Waiting for access</h2>
            <p className="mt-2 text-muted-foreground">
              Your account exists but has no role yet. Ask an Admin to grant access. Your user ID:{" "}
              <code className="rounded bg-muted px-1">{auth.user.id}</code>
            </p>
          </div>
        ) : (
          children(auth)
        )}
      </main>
    </div>
  );
}
