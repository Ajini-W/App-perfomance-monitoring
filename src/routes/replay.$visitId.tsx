import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import "rrweb-player/dist/style.css";

export const Route = createFileRoute("/replay/$visitId")({
  head: () => ({
    meta: [
      { title: "Replay & Telemetry — Replay Console" },
      { name: "description", content: "Replay a recorded page visit with OpenTelemetry traces." },
    ],
  }),
  component: () => <AppShell>{() => <Replay />}</AppShell>,
});

type RREvent = { type: number; timestamp: number; [k: string]: unknown };

interface TelemetrySpan {
  id: string;
  trace_id: string;
  span_id: string;
  name: string;
  kind: string;
  status: string;
  status_code: number | null;
  duration_ms: number;
  start_time: string;
  end_time: string;
  attributes: Record<string, unknown>;
}

function Replay() {
  const { visitId } = Route.useParams();
  const [visit, setVisit] = useState<Tables<"page_visits"> | null>(null);
  const [events, setEvents] = useState<RREvent[] | null>(null);
  const [spans, setSpans] = useState<TelemetrySpan[]>([]);
  const [selectedSpan, setSelectedSpan] = useState<TelemetrySpan | null>(null);
  const [filterKind, setFilterKind] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const { data: v, error: e1 } = await supabase
        .from("page_visits")
        .select("*")
        .eq("id", visitId)
        .maybeSingle();
      if (e1 || !v) return setError("Segment not found or you don't have access to it.");
      setVisit(v);

      const { data: batches, error: e2 } = await supabase
        .from("event_batches")
        .select("seq, events")
        .eq("visit_id", visitId)
        .order("seq");
      if (e2) return setError(e2.message);
      const all = (batches ?? []).flatMap((b) => b.events as unknown as RREvent[]);
      all.sort((a, b) => a.timestamp - b.timestamp);
      setEvents(all);

      // Fetch OpenTelemetry spans
      const { data: spansData } = await (supabase as any)
        .from("telemetry_spans")
        .select("*")
        .eq("visit_id", visitId)
        .order("start_time", { ascending: true });
      if (spansData) {
        setSpans(spansData as TelemetrySpan[]);
      }
    })();
  }, [visitId]);

  useEffect(() => {
    if (!events || events.length < 2 || !holder.current) return;
    const el = holder.current;
    let player: { $destroy?: () => void } | null = null;
    import("rrweb-player").then(({ default: RRWebPlayer }) => {
      el.innerHTML = "";
      const width = Math.min(el.clientWidth, 950);
      player = new RRWebPlayer({
        target: el,
        props: {
          events: events as never,
          width,
          height: Math.round(width * 0.56),
          autoPlay: false,
          showController: true,
        },
      }) as never;
    });
    return () => {
      player?.$destroy?.();
    };
  }, [events]);

  const download = () => {
    if (!visit || !events) return;
    const blob = new Blob([JSON.stringify({ visit, events, telemetry: spans }, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `replay-${visit.module_name.replace(/[^a-z0-9]+/gi, "-")}-${visit.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const filteredSpans = spans.filter((s) => {
    if (filterKind === "all") return true;
    return s.kind === filterKind;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link to="/dashboard" className="text-sm text-primary underline">
            ← All recordings
          </Link>
          <h1 className="mt-2 text-3xl font-bold">{visit?.module_name ?? "Replay"}</h1>
          {visit && (
            <p className="text-sm text-muted-foreground">
              {visit.url} · session {visit.session_id.slice(0, 8)} ·{" "}
              {new Date(visit.started_at).toLocaleString()} · {visit.event_count} events ·{" "}
              {spans.length} telemetry spans
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={download} disabled={!events}>
            Download JSON (with Traces)
          </Button>
        </div>
      </div>

      {error && <p className="rounded bg-destructive/10 p-3 text-destructive">{error}</p>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: Video Player */}
        <div className="lg:col-span-2 space-y-4">
          <div
            ref={holder}
            className="flex min-h-[350px] items-center justify-center rounded-lg border bg-black text-white"
          >
            {!events && !error && <p className="text-sm text-muted-foreground">Loading replay...</p>}
            {events && events.length < 2 && (
              <p className="text-sm text-muted-foreground">Not enough events recorded to replay.</p>
            )}
          </div>
        </div>

        {/* Right: OpenTelemetry Traces Inspector */}
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <div className="flex items-center justify-between border-b pb-2">
            <h2 className="text-lg font-semibold">Telemetry & Traces</h2>
            <span className="text-xs text-muted-foreground">{spans.length} captured</span>
          </div>

          <div className="flex gap-1 text-xs">
            {["all", "client_request", "error", "navigation"].map((k) => (
              <button
                key={k}
                onClick={() => setFilterKind(k)}
                className={`rounded px-2 py-1 capitalize ${
                  filterKind === k ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}
              >
                {k === "client_request" ? "API Calls" : k}
              </button>
            ))}
          </div>

          <div className="max-h-[480px] overflow-y-auto space-y-2 pr-1">
            {filteredSpans.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">
                No telemetry spans recorded for this filter.
              </p>
            ) : (
              filteredSpans.map((s) => (
                <div
                  key={s.id}
                  onClick={() => setSelectedSpan(selectedSpan?.id === s.id ? null : s)}
                  className={`cursor-pointer rounded border p-2 text-xs transition ${
                    selectedSpan?.id === s.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-medium truncate max-w-[180px]">{s.name}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        s.status === "error" || (s.status_code && s.status_code >= 400)
                          ? "bg-red-500/10 text-red-600"
                          : "bg-green-500/10 text-green-600"
                      }`}
                    >
                      {s.status_code ? s.status_code : s.status}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{s.duration_ms}ms</span>
                    <span>{new Date(s.start_time).toLocaleTimeString()}</span>
                  </div>

                  {selectedSpan?.id === s.id && (
                    <div className="mt-2 pt-2 border-t font-mono text-[10px] space-y-1 text-muted-foreground">
                      <div>Trace: {s.trace_id}</div>
                      <div>Span: {s.span_id}</div>
                      {Object.keys(s.attributes).length > 0 && (
                        <pre className="mt-1 max-h-24 overflow-auto rounded bg-muted/50 p-1 text-[10px]">
                          {JSON.stringify(s.attributes, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
