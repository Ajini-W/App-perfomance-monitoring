import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getWebsites,
  getVisits,
  addWebsite,
  updateWebsiteSettings,
} from "@/lib/replay-actions";

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
  component: () => <AppShell>{(auth) => <Dashboard isAdmin={auth?.isAdmin ?? true} />}</AppShell>,
});

type Website = {
  id: string;
  name: string;
  site_key: string;
  allowed_origins: string[];
  permitted_paths: string[];
  retention_days: number;
  created_at: string;
};

type Visit = {
  id: string;
  website_id: string;
  session_id: string;
  user_agent?: string;
  module_name: string;
  url: string;
  path: string;
  started_at: string;
  ended_at: string | null;
  event_count: number;
};

function Dashboard({ isAdmin }: { isAdmin: boolean }) {
  const [sites, setSites] = useState<Website[]>([]);
  const [siteId, setSiteId] = useState<string>("");
  const [visits, setVisits] = useState<Visit[]>([]);
  const [sessionFilter, setSessionFilter] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");

  const loadSites = useCallback(async () => {
    try {
      const data = await getWebsites();
      setSites(data ?? []);
      if (data?.length) {
        setSiteId((cur) => cur || data[0]?.id || "");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load websites");
    }
  }, []);

  const loadVisits = useCallback(async () => {
    if (!siteId) return;
    try {
      const data = await getVisits({ data: siteId });
      setVisits(data ?? []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load recordings");
    }
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
        <h2 className="text-lg font-semibold">Websites</h2>
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
                {Array.isArray(s.permitted_paths) ? s.permitted_paths.join(", ") : "/*"}
              </div>
            </button>
          ))}
          {!sites.length && (
            <p className="text-sm text-muted-foreground">No websites registered yet.</p>
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
                      No recordings yet. Open your target website, interact with it, then click Refresh.
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
  const [loading, setLoading] = useState(false);

  return (
    <form
      className="space-y-2 rounded-lg border bg-card p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        setLoading(true);
        try {
          await addWebsite({ data: name.trim() });
          setName("");
          toast.success("Website added! Configure allowed origins next.");
          onAdded();
        } catch (err: any) {
          toast.error(err.message || "Failed to add website");
        } finally {
          setLoading(false);
        }
      }}
    >
      <Label>Add a website</Label>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="My website"
        required
      />
      <Button type="submit" size="sm" className="w-full" disabled={loading}>
        {loading ? "Adding..." : "Add"}
      </Button>
    </form>
  );
}

function SiteSettings({ site, onSaved }: { site: Website; onSaved: () => void }) {
  const [origins, setOrigins] = useState(
    Array.isArray(site.allowed_origins) ? site.allowed_origins.join(", ") : "*"
  );
  const [paths, setPaths] = useState(
    Array.isArray(site.permitted_paths) ? site.permitted_paths.join(", ") : "/*"
  );
  const [retention, setRetention] = useState(String(site.retention_days || 30));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setOrigins(Array.isArray(site.allowed_origins) ? site.allowed_origins.join(", ") : "*");
    setPaths(Array.isArray(site.permitted_paths) ? site.permitted_paths.join(", ") : "/*");
    setRetention(String(site.retention_days || 30));
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
      <summary className="cursor-pointer font-semibold text-lg">
        Settings & install snippet — {site.name}
      </summary>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2">
          <Label>Install snippet (paste before &lt;/body&gt; on every page)</Label>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs font-mono">
            {snippet}
          </pre>
        </div>
        <div className="space-y-1">
          <Label>Allowed origins (comma separated, * = any)</Label>
          <Input
            value={origins}
            onChange={(e) => setOrigins(e.target.value)}
            placeholder="http://localhost:8080"
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
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              try {
                await updateWebsiteSettings({
                  data: {
                    id: site.id,
                    origins: split(origins),
                    paths: split(paths),
                    retention: Math.max(1, Number(retention) || 30),
                  },
                });
                toast.success("Settings saved successfully!");
                onSaved();
              } catch (err: any) {
                toast.error(err.message || "Failed to update settings");
              } finally {
                setLoading(false);
              }
            }}
          >
            {loading ? "Saving..." : "Save settings"}
          </Button>
        </div>
      </div>
    </details>
  );
}
