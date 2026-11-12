import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { originAllowed, pathPermitted } from "@/lib/replay-rules";
import { db } from "@/lib/mysql";

const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin ?? "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  // traceparent/tracestate: the OpenTelemetry fetch instrumentation adds them to cross-origin calls.
  "Access-Control-Allow-Headers": "Content-Type, traceparent, tracestate",
  Vary: "Origin",
});

// public/sdk/otel-web.min.js (built from src/sdk/otel-tracer.ts) sends snake_case fields
// (trace_id, span_id, start_time, ...). camelCase is still accepted for older clients.
const TelemetrySpanSchema = z.object({
  id: z.string().optional(),
  trace_id: z.string().optional(),
  span_id: z.string().optional(),
  parent_span_id: z.string().nullable().optional(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  duration_ms: z.number().optional(),
  traceId: z.string().optional(),
  spanId: z.string().optional(),
  parentSpanId: z.string().nullable().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  durationMs: z.number().optional(),
  name: z.string().max(200),
  kind: z.string().max(50).optional(),
  status: z.string().max(20).optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
});

const Payload = z.object({
  siteKey: z.string().min(4).max(100),
  sessionId: z.string().uuid(),
  visit: z.object({
    id: z.string().uuid(),
    module: z.string().min(1).max(200),
    url: z.string().max(2000),
    path: z.string().max(1000),
    startedAt: z.string(),
  }),
  seq: z.number().int().min(0).max(1_000_000),
  events: z.array(z.record(z.string(), z.unknown())).max(2000),
  spans: z.array(TelemetrySpanSchema).optional(),
  ended: z.boolean().optional(),
});

export const Route = createFileRoute("/api/public/ingest")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: cors(request.headers.get("origin")) }),

      POST: async ({ request }) => {
        const origin = request.headers.get("origin");
        const headers = cors(origin);
        const raw = await request.text();
        if (raw.length > 5_000_000) return new Response("Too large", { status: 413, headers });

        let parsed;
        try {
          parsed = Payload.safeParse(JSON.parse(raw));
        } catch {
          return new Response("Bad JSON", { status: 400, headers });
        }
        if (!parsed.success) return new Response("Invalid payload", { status: 400, headers });
        const p = parsed.data;

        try {
          // 1. Website உள்ளதா என்று MySQL-ல் சரிபார்த்தல்
          const [sites]: any = await db.execute(
            "SELECT id, allowed_origins, permitted_paths FROM websites WHERE site_key = ? LIMIT 1",
            [p.siteKey]
          );

          if (!sites || sites.length === 0) {
            return new Response("Unknown site", { status: 403, headers });
          }

          const site = sites[0];
          const allowedOrigins = typeof site.allowed_origins === "string" 
            ? JSON.parse(site.allowed_origins) 
            : site.allowed_origins;
          const permittedPaths = typeof site.permitted_paths === "string" 
            ? JSON.parse(site.permitted_paths) 
            : site.permitted_paths;

          if (!originAllowed(origin, allowedOrigins)) {
            return new Response("Origin not allowed", { status: 403, headers });
          }
          if (!pathPermitted(p.visit.path, permittedPaths)) {
            return new Response("Page not permitted", { status: 403, headers });
          }

          const userAgent = (request.headers.get("user-agent") ?? "").slice(0, 300);
          const startedAtDate = new Date(p.visit.startedAt);
          const endedAtDate = p.ended ? new Date() : null;

          // 2. Visit-ஐ MySQL visits table-ல் Insert அல்லது Update செய்தல்
          await db.execute(
            `INSERT INTO visits (id, website_id, session_id, user_agent, module, url, path, started_at, ended_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE ended_at = COALESCE(VALUES(ended_at), ended_at)`,
            [
              p.visit.id,
              site.id,
              p.sessionId,
              userAgent,
              p.visit.module,
              p.visit.url,
              p.visit.path,
              startedAtDate,
              endedAtDate,
            ]
          );

          // 3. Recording events-ஐ replay_chunks table-ல் சேமித்தல்
          // INSERT IGNORE: the recorder retries failed uploads with the same seq.
          if (p.events && p.events.length > 0) {
            await db.execute(
              `INSERT IGNORE INTO replay_chunks (visit_id, seq, events) VALUES (?, ?, ?)`,
              [p.visit.id, p.seq, JSON.stringify(p.events)]
            );
          }

          // 4. OpenTelemetry Spans இருந்தால் telemetry_spans table-ல் சேமித்தல்
          if (p.spans && p.spans.length > 0) {
            for (const span of p.spans) {
              const traceId = span.trace_id || span.traceId || null;
              const otelSpanId = span.span_id || span.spanId || null;
              const startIso = span.start_time || span.startTime;
              const endIso = span.end_time || span.endTime;
              const startTime = startIso ? new Date(startIso) : new Date();
              const endTime = endIso ? new Date(endIso) : startTime;
              const rowId = span.id || otelSpanId || crypto.randomUUID();
              // INSERT IGNORE: a retried upload must not fail on spans already stored.
              await db.execute(
                `INSERT IGNORE INTO telemetry_spans 
                 (id, visit_id, trace_id, span_id, parent_span_id, name, kind, status, duration_ms, start_time, end_time, attributes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  rowId,
                  p.visit.id,
                  traceId,
                  otelSpanId,
                  span.parent_span_id || span.parentSpanId || null,
                  span.name,
                  span.kind || "INTERNAL",
                  span.status || "UNSET",
                  span.duration_ms ?? span.durationMs ?? Math.max(0, endTime.getTime() - startTime.getTime()),
                  startTime,
                  endTime,
                  JSON.stringify(span.attributes || {}),
                ]
              );
            }
          }

          return new Response("ok", { headers });
        } catch (err: any) {
          console.error("[ingest error]:", err);
          return new Response("Database error", { status: 500, headers });
        }
      },
    },
  },
});
