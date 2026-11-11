import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Recordings — Replay Console" },
      { name: "description", content: "Browse recorded sessions by website, session and module." },
      { property: "og:title", content: "Recordings — Replay Console" },
      {
        property: "og:description",
        content: "Browse recorded sessions by website, session and module.",
      },
    ],
  }),
  component: () => <AppShell>{(auth) => <Dashboard isAdmin={auth.isAdmin} />}</AppShell>,
});

type Website = Tables<"websites">;
type Visit = Tables<"page_visits">;

function Dashboard({ isAdmin }: { isAdmin: boolean }) {
  const [sites, setSites] = useState<Website[]>([]);
  const [siteId, setSiteId] = useState<string>("");
  const [visits, setVisits] = useState<Visit[]>([]);
  const [sessionFilter, setSessionFilter] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");

  const loadSites = useCallback(async () => {
    const { data } = await supabase.from("websites").select("*").order("created_at");
    setSites(data ?? []);
    if (data?.length) setSiteId((cur) => cur || data[0]?.id || "");
  }, []);

  const loadVisits = useCallback(async () => {
    if (!siteId) return;
    const { data, error } = await supabase
      .from("page_visits")
      .select("*")
      .eq("website_id", siteId)
      .order("started_at", { ascending: false })
      .limit(500);
    if (error) toast.error(error.message);
    setVisits(data ?? []);
  }, [siteId]);

  useEffect(() => {
    loadSites();
  }, [loadSites]);
  useEffect(() => {
    loadVisits();
  }, [loadVisits]);

  const modules = useMemo(() => [...new Set(visits.map((v) => v.module_name))].sort(), [visits]);
  const filtered = visits.filter(
    (v) =>
      (!sessionFilter || v.session_id.startsWith(sessionFilter.trim())) &&
      (!moduleFilter || v.module_name === moduleFilter),
  );
  const site = sites.find((s) => s.id === siteId);

  return (
    <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-4">
        <h2 className="text-lg">Websites</h2>
        <div className="space-y-2">
          {sites.map((s) => (
            <button
              key={s.id}
              onClick={() => setSiteId(s.id)}
              className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                s.id === siteId
                  ? "border-primary bg-accent text-accent-foreground"
                  : "bg-card hover:bg-muted"
              }`}
            >
              <div className="font-medium">{s.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {s.permitted_paths.join(", ")}
              </div>
            </button>
          ))}
          {!sites.length && (
            <p className="text-sm text-muted-foreground">No websites you can access.</p>
          )}
        </div>
        {isAdmin && <AddWebsite onAdded={loadSites} />}
      </aside>

      <section className="space-y-6">
        {site && isAdmin && <SiteSettings site={site} onSaved={loadSites} />}

        <div className="rounded-xl border bg-card shadow-card">
          <div className="flex flex-wrap items-end gap-4 border-b p-4">
            <div className="space-y-1">
              <Label>Module / page</Label>
              <select
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={moduleFilter}
                onChange={(e) => setModuleFilter(e.target.value)}
              >
                <option value="">All modules</option>
                {modules.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Session ID starts with</Label>
              <Input
                className="h-9 w-56"
                value={sessionFilter}
                onChange={(e) => setSessionFilter(e.target.value)}
                placeholder="e.g. 3f2a"
              />
            </div>
            <Button variant="outline" size="sm" onClick={loadVisits}>
              Refresh
            </Button>
            <span className="ml-auto text-sm text-muted-foreground">
              {filtered.length} segments
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Module / page</th>
                  <th className="px-4 py-2 font-medium">Path</th>
                  <th className="px-4 py-2 font-medium">Session</th>
                  <th className="px-4 py-2 font-medium">Started</th>
                  <th className="px-4 py-2 font-medium">Duration</th>
                  <th className="px-4 py-2 text-right font-medium">Events</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <tr key={v.id} className="border-t hover:bg-muted/50">
                    <td className="px-4 py-2 font-medium">{v.module_name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{v.path}</td>
                    <td className="px-4 py-2">
                      <button
                        className="font-mono text-xs text-primary underline"
                        onClick={() => setSessionFilter(v.session_id)}
                      >
                        {v.session_id.slice(0, 8)}
                      </button>
                    </td>
                    <td className="px-4 py-2">{new Date(v.started_at).toLocaleString()}</td>
                    <td className="px-4 py-2">
                      {v.ended_at
                        ? `${Math.max(1, Math.round((+new Date(v.ended_at) - +new Date(v.started_at)) / 1000))}s`
                        : "open"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{v.event_count}</td>
                    <td className="px-4 py-2 text-right">
                      <Button asChild size="sm">
                        <Link to="/replay/$visitId" params={{ visitId: v.id }}>
                          Replay
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      No recordings yet. Open the{" "}
                      <Link to="/demo" className="text-primary underline">
                        demo website
                      </Link>
                      , click around, then refresh.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function AddWebsite({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState("");
  return (
    <form
      className="space-y-2 rounded-lg border bg-card p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const { error } = await supabase.from("websites").insert({ name });
        if (error) {
          toast.error(error.message);
          return;
        }
        setName("");
        toast.success("Website added — set its allowed origins next.");
        onAdded();
      }}
    >
      <Label>Add a website</Label>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="My shop"
        required
      />
      <Button type="submit" size="sm" className="w-full">
        Add
      </Button>
    </form>
  );
}

function SiteSettings({ site, onSaved }: { site: Website; onSaved: () => void }) {
  const [origins, setOrigins] = useState(site.allowed_origins.join(", "));
  const [paths, setPaths] = useState(site.permitted_paths.join(", "));
  const [retention, setRetention] = useState(String(site.retention_days));
  const [grantUser, setGrantUser] = useState("");
  useEffect(() => {
    setOrigins(site.allowed_origins.join(", "));
    setPaths(site.permitted_paths.join(", "));
    setRetention(String(site.retention_days));
  }, [site]);
  const host = typeof window === "undefined" ? "" : window.location.origin;
  const snippet = `<script src="${host}/sdk/recorder.js" data-site-key="${site.site_key}" defer></script>`;
  const split = (s: string) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

  return (
    <details className="rounded-xl border bg-card p-4 shadow-card">
      <summary className="cursor-pointer font-display text-lg">
        Settings & install snippet — {site.name}
      </summary>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2">
          <Label>Install snippet (paste before &lt;/body&gt; on every page)</Label>
          <pre className="overflow-x-auto rounded-md bg-sidebar p-3 text-xs text-sidebar-foreground">
            {snippet}
          </pre>
        </div>
        <div className="space-y-1">
          <Label>Allowed origins (comma separated, * = any)</Label>
          <Input
            value={origins}
            onChange={(e) => setOrigins(e.target.value)}
            placeholder="https://shop.example.com"
          />
        </div>
        <div className="space-y-1">
          <Label>Permitted pages (comma separated, * wildcard)</Label>
          <Input
            value={paths}
            onChange={(e) => setPaths(e.target.value)}
            placeholder="/*, /checkout*"
          />
        </div>
        <div className="space-y-1">
          <Label>Retention (days)</Label>
          <Input
            type="number"
            min={1}
            value={retention}
            onChange={(e) => setRetention(e.target.value)}
          />
        </div>
        <div className="flex items-end">
          <Button
            onClick={async () => {
              const { error } = await supabase
                .from("websites")
                .update({
                  allowed_origins: split(origins),
                  permitted_paths: split(paths),
                  retention_days: Math.max(1, Number(retention) || 30),
                })
                .eq("id", site.id);
              if (error) toast.error(error.message);
              else {
                toast.success("Saved");
                onSaved();
              }
            }}
          >
            Save settings
          </Button>
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label>Grant a teammate view access to this website (their user ID)</Label>
          <div className="flex gap-2">
            <Input
              value={grantUser}
              onChange={(e) => setGrantUser(e.target.value)}
              placeholder="user UUID shown on their 'Waiting for access' screen"
            />
            <Button
              variant="secondary"
              onClick={async () => {
                const uid = grantUser.trim();
                const r1 = await supabase
                  .from("user_roles")
                  .upsert({ user_id: uid, role: "viewer" }, { onConflict: "user_id,role" });
                const r2 = await supabase
                  .from("website_access")
                  .upsert({ user_id: uid, website_id: site.id });
                const err = r1.error ?? r2.error;
                if (err) toast.error(err.message);
                else {
                  toast.success("Access granted");
                  setGrantUser("");
                }
              }}
            >
              Grant
            </Button>
          </div>
        </div>
      </div>
    </details>
  );
}
