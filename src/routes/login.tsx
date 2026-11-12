import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Admin sign in — Replay Console" },
      { name: "description", content: "Sign in to view and replay recorded sessions." },
      { property: "og:title", content: "Admin sign in — Replay Console" },
      { property: "og:description", content: "Sign in to view and replay recorded sessions." },
    ],
  }),
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // Supabase Auth was removed in the MySQL migration. The console currently runs in local
  // single-admin mode (see src/hooks/useAuth.ts), so the form simply opens the dashboard.
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    if (mode === "up") toast.success("Local mode: no account needed, opening the console.");
    navigate({ to: "/dashboard" });
    setBusy(false);
  };

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col justify-end bg-brand p-12 text-sidebar-foreground md:flex">
        <h1 className="text-4xl">Replay Console</h1>
        <p className="mt-3 max-w-sm text-sidebar-foreground/80">
          Only authorised Admins can list, replay, or download recordings.
        </p>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <h2 className="text-3xl">{mode === "in" ? "Sign in" : "Create account"}</h2>
          {mode === "up" && (
            <p className="text-sm text-muted-foreground">
              The very first account becomes the Admin. Later accounts get no access until an Admin
              grants it.
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {mode === "in" ? "Sign in" : "Create account"}
          </Button>
          <button
            type="button"
            className="text-sm text-primary underline"
            onClick={() => setMode(mode === "in" ? "up" : "in")}
          >
            {mode === "in" ? "No account yet? Create one" : "Have an account? Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
