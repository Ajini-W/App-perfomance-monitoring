import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { getReplayData } from "@/lib/replay-actions";
import {
  DEFAULT_MATCH_WINDOW_MS,
  findActiveSpanKeys,
  playbackToAbsolute,
  sameKeys,
  spanKey,
  spanOffsetMs,
} from "@/lib/replay-sync";
import "rrweb-player/dist/style.css";

export const Route = createFileRoute("/replay/$visitId")({
  head: () => ({
    meta: [
      { title: "Replay segment — Replay Console" },
      { name: "description", content: "Replay recorded session with OpenTelemetry traces." },
      { property: "og:title", content: "Replay segment — Replay Console" },
      { property: "og:description", content: "Replay recorded session with OpenTelemetry traces." },
    ],
  }),
  component: () => <AppShell>{() => <Replay />}</AppShell>,
});

type RREvent = { type: number; timestamp: number; [k: string]: unknown };

type TelemetrySpan = {
  id: string;
  trace_id: string;
  span_id: string;
  parent_span_id?: string | null;
  name: string;
  kind?: string | null;
  status: string;
  duration_ms: number;
  start_time: string;
  end_time: string;
  attributes: Record<string, any>;
};

// OpenTelemetry attributes-la irunthu endpoint path mattum edukka
function getSpanEndpoint(span: TelemetrySpan): string {
  const attrs = span.attributes || {};
  const raw =
    attrs["http.target"] ||
    attrs["url.path"] ||
    attrs["http.url"] ||
    attrs["url.full"] ||
    attrs["endpoint"] ||
    "";

  if (!raw) return "";

  try {
    // Full URL aaga irunthaal (eg: http://localhost:8080/api/cart), path mattum edukkom
    if (typeof raw === "string" && (raw.startsWith("http://") || raw.startsWith("https://"))) {
      const u = new URL(raw);
      return u.pathname + (u.search || "");
    }
    return String(raw);
  } catch {
    return String(raw);
  }
}

// HTTP Method (GET, POST, PUT, DELETE) color style
function getMethodBadgeClass(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30";
    case "POST":
      return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
    case "PUT":
    case "PATCH":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30";
    case "DELETE":
      return "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}


function Replay() {
  const { visitId } = Route.useParams();
  const [visit, setVisit] = useState<any | null>(null);
  const [events, setEvents] = useState<RREvent[] | null>(null);
  const [spans, setSpans] = useState<TelemetrySpan[]>([]);
  const [spanFilter, setSpanFilter] = useState<"all" | "fetch" | "error" | "nav">("all");
  const [selectedSpan, setSelectedSpan] = useState<TelemetrySpan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const holder = useRef<HTMLDivElement>(null);
  const spanList = useRef<HTMLDivElement>(null);
  // Replay ↔ trace sync: replay start (epoch ms of first rrweb event), player offset, matches.
  const [replayStart, setReplayStart] = useState<number | null>(null);
  const [playbackOffset, setPlaybackOffset] = useState(0);
  const [playerState, setPlayerState] = useState<"playing" | "paused">("paused");
  const [activeKeys, setActiveKeys] = useState<Set<string>>(() => new Set());
  const spansRef = useRef<TelemetrySpan[]>([]);
  spansRef.current = spans;

  // 1. MySQL-ல் இருந்து Visit, rrweb Events மற்றும் OpenTelemetry Spans எடுத்தல்
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await getReplayData({ data: visitId });
        if (!data || !data.visit) {
          setError("Session recording not found in MySQL database.");
          return;
        }
        setVisit(data.visit);
        setEvents(data.events || []);
        setSpans(data.spans || []);
      } catch (err: any) {
        setError(err.message || "Failed to load replay data");
      } finally {
        setLoading(false);
      }
    })();
  }, [visitId]);

  // 2. rrweb-player-ஐ இடது பக்க Container-ல் இயக்குதல்
  useEffect(() => {
    if (!events || events.length < 2 || !holder.current) return;
    const el = holder.current;
    let player: { $destroy?: () => void } | null = null;

    let cancelled = false;

    import("rrweb-player").then(({ default: RRWebPlayer }) => {
      if (cancelled) return;
      el.innerHTML = "";
      const width = Math.min(el.clientWidth, 800);
      const instance = new RRWebPlayer({
        target: el,
        props: {
          events: events as never,
          width,
          height: Math.round(width * 0.58),
          autoPlay: false,
          showController: true,
        },
      });
      player = instance as never;

      // Replay time 0 = first rrweb event; spans carry wall-clock times from the same tab.
      const start = instance.getMetaData?.().startTime ?? events[0]!.timestamp;
      setReplayStart(start);

      // Recompute matching spans; only re-render the panel when the set actually changes.
      let lastOffsetBucket = -1;
      const sync = (offset: number) => {
        if (cancelled || !Number.isFinite(offset)) return;
        const abs = playbackToAbsolute(start, offset);
        const next = findActiveSpanKeys(spansRef.current, abs, DEFAULT_MATCH_WINDOW_MS);
        setActiveKeys((prev) => (sameKeys(prev, next) ? prev : next));
        const bucket = Math.floor(offset / 100);
        if (bucket !== lastOffsetBucket) {
          lastOffsetBucket = bucket;
          setPlaybackOffset(offset);
        }
      };

      // Fired every animation frame while playing and once after each seek/jump; it does not
      // fire while paused, so highlighting freezes on pause and jumps immediately on seek.
      instance.addEventListener("ui-update-current-time", (e: { payload: number }) =>
        sync(e.payload),
      );
      instance.addEventListener("ui-update-player-state", (e: { payload: "playing" | "paused" }) => {
        if (cancelled) return;
        setPlayerState(e.payload);
        sync(instance.getReplayer().getCurrentTime());
      });
      sync(0);
    });

    return () => {
      cancelled = true;
      player?.$destroy?.();
    };
  }, [events]);

  // Re-match if spans load/change while the player sits at a position.
  useEffect(() => {
    if (replayStart == null) return;
    const next = findActiveSpanKeys(spans, playbackToAbsolute(replayStart, playbackOffset));
    setActiveKeys((prev) => (sameKeys(prev, next) ? prev : next));
  }, [spans, replayStart, playbackOffset]);

  // Keep the first highlighted span visible inside the trace list (without scrolling the page).
  useEffect(() => {
    const list = spanList.current;
    if (!list || activeKeys.size === 0) return;
    const row = list.querySelector<HTMLElement>('[data-active="true"]');
    if (!row) return;
    const top = row.offsetTop;
    const bottom = top + row.offsetHeight;
    if (top < list.scrollTop || bottom > list.scrollTop + list.clientHeight) {
      list.scrollTo({ top: Math.max(0, top - 8), behavior: "smooth" });
    }
  }, [activeKeys]);

  // 3. JSON Export (Recording + Telemetry Traces)
  const download = () => {
    if (!visit) return;
    const blob = new Blob([JSON.stringify({ visit, events, spans }, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `replay-${(visit.module_name || "session").replace(/[^a-z0-9]+/gi, "-")}-${visit.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // 4. OpenTelemetry Spans Filtering
  const filteredSpans = spans.filter((s) => {
    if (spanFilter === "fetch") return s.name.toLowerCase().includes("fetch") || s.name.toLowerCase().includes("http");
    if (spanFilter === "error") return s.status.toLowerCase() === "error";
    if (spanFilter === "nav") return s.name.toLowerCase().includes("nav") || s.name.toLowerCase().includes("document");
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link to="/dashboard" className="text-sm text-primary underline">
            ← All recordings
          </Link>
          <h1 className="mt-2 text-3xl font-bold">{visit?.module_name ?? "Replay & Traces"}</h1>
          {visit && (
            <p className="text-sm text-muted-foreground">
              {visit.url} · Session: <code className="font-mono">{visit.session_id?.slice(0, 8)}</code> ·{" "}
              {new Date(visit.started_at).toLocaleString()} · {events?.length ?? 0} DOM events ·{" "}
              {spans.length} OpenTelemetry spans
            </p>
          )}
        </div>
        <Button onClick={download} disabled={!events?.length && !spans.length}>
          Download JSON
        </Button>
      </div>

      {loading && <p className="text-muted-foreground">Loading session replay from MySQL...</p>}
      {error && <p className="rounded-lg border border-destructive p-4 text-destructive">{error}</p>}

      {/* Split View: Player (Left) + OpenTelemetry Traces (Right) */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Column: rrweb Player (8 cols) */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-3">
          <div className="rounded-xl border bg-card p-4 shadow-card">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Visual Replay (rrweb)
            </h2>
            <div ref={holder} className="flex justify-center min-h-[350px] bg-black/5 rounded-lg items-center" />
            {events && events.length < 2 && (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Not enough DOM events to replay this segment yet.
              </p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Replay rebuilds the UI from recorded DOM mutation events. All sensitive inputs are masked.
            </p>
          </div>
        </div>

        {/* Right Column: OpenTelemetry Spans Panel (4 cols) */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-3">
          <div className="rounded-xl border bg-card p-4 shadow-card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Telemetry & Traces
              </h2>
              <span className="text-xs text-muted-foreground font-mono">
                {spans.length} captured
              </span>
            </div>

            {/* Replay ↔ trace sync status */}
            {replayStart != null && (
              <p className="mb-3 text-[11px] font-mono text-muted-foreground" data-testid="replay-sync-status">
                {playerState === "playing" ? "▶" : "❚❚"} replay +{(playbackOffset / 1000).toFixed(1)}s ·{" "}
                {activeKeys.size} matching (±{DEFAULT_MATCH_WINDOW_MS / 1000}s)
              </p>
            )}

            {/* Filter Buttons */}
            <div className="flex flex-wrap gap-1 mb-3">
              {(["all", "fetch", "error", "nav"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setSpanFilter(f)}
                  className={`px-2.5 py-1 text-xs rounded-md border font-medium transition-colors ${
                    spanFilter === f
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/50 hover:bg-muted text-muted-foreground"
                  }`}
                >
                  {f === "all" ? "All" : f === "fetch" ? "API Calls" : f === "error" ? "Errors" : "Navigation"}
                </button>
              ))}
            </div>

            {/* Spans List */}
            <div ref={spanList} className="relative space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {filteredSpans.map((s) => {
                const key = spanKey(s);
                const active = activeKeys.has(key);
                return (
                <div
                  key={key}
                  data-span-key={key}
                  data-active={active ? "true" : "false"}
                  onClick={() => setSelectedSpan(selectedSpan?.span_id === s.span_id ? null : s)}
                  className={`cursor-pointer rounded-lg border p-2.5 text-xs transition-colors ${
                    active ? "ring-2 ring-primary/50 " : ""
                  }${
                    selectedSpan?.span_id === s.span_id
                      ? "border-primary bg-accent/40"
                      : active
                        ? "border-primary/60 bg-primary/10"
                        : "hover:bg-muted/50 bg-background"
                  }`}
                >
                  {/* ✅ Puthu Code: Method + Endpoint Path */}
                  {(() => {
                    const endpoint = getSpanEndpoint(s);
                    const method = (s.attributes?.["http.method"] || s.name || "GET")
                      .toString()
                      .replace(/^HTTP\s+/i, "")
                      .toUpperCase();

                    return (
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {/* HTTP Method Badge (GET, PUT, etc.) */}
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono border shrink-0 ${getMethodBadgeClass(
                              method
                            )}`}
                          >
                            {method}
                          </span>

                          {/* API Endpoint Path (e.g. /api/products) */}
                          <span
                            className="font-mono text-xs text-foreground/90 truncate"
                            title={endpoint || s.name}
                          >
                            {endpoint || s.name}
                          </span>
                        </div>

                        {/* Right side: Status Badge + Duration */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                              s.status?.toLowerCase() === "error"
                                ? "bg-red-500/20 text-red-600"
                                : "bg-emerald-500/20 text-emerald-600"
                            }`}
                          >
                            {s.status || "unset"}
                          </span>
                          <span className="font-mono text-muted-foreground">{s.duration_ms}ms</span>
                        </div>
                      </div>
                    );
                  })()}


                  {/* Expanded Span Details */}
                  {selectedSpan?.span_id === s.span_id && (
                    <div className="mt-2.5 pt-2 border-t space-y-1 text-[11px] font-mono text-muted-foreground bg-muted/30 p-2 rounded">
                      <div><strong className="text-foreground">Trace ID:</strong> {s.trace_id}</div>
                      <div><strong className="text-foreground">Span ID:</strong> {s.span_id}</div>
                      {s.parent_span_id && <div><strong className="text-foreground">Parent:</strong> {s.parent_span_id}</div>}
                      {s.attributes && Object.keys(s.attributes).length > 0 && (
                        <div className="mt-1">
                          <strong className="text-foreground">Attributes:</strong>
                          <pre className="mt-1 overflow-x-auto text-[10px] max-h-36 p-1.5 bg-background rounded border">
                            {JSON.stringify(s.attributes, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                );
              })}

              {!filteredSpans.length && (
                <p className="text-center text-xs text-muted-foreground py-8">
                  No telemetry spans found for this filter.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
