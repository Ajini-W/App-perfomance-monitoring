import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { originAllowed, pathPermitted } from "@/lib/replay-rules";

const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin ?? "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  Vary: "Origin",
});

const TelemetrySpanSchema = z.object({
  trace_id: z.string().min(1).max(100),
  span_id: z.string().min(1).max(100),
  parent_span_id: z.string().max(100).nullable().optional(),
  name: z.string().min(1).max(500),
  kind: z.string().max(50).default("CLIENT"),
  status: z.enum(["ok", "error", "unset"]).default("unset"),
  status_code: z.number().int().nullable().optional(),
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  duration_ms: z.number().nonnegative(),
  attributes: z.record(z.string(), z.unknown()).default({}),
});

const Payload = z.object({
  siteKey: z.string().min(4).max(100),
  sessionId: z.string().uuid(),
  visit: z.object({
    id: z.string().uuid(),
    module: z.string().min(1).max(200),
    url: z.string().max(2000),
    path: z.string().max(1000),
    startedAt: z.string().datetime(),
  }),
  seq: z.number().int().min(0).max(1_000_000),
  events: z.array(z.record(z.string(), z.unknown())).max(2000),
  spans: z.array(TelemetrySpanSchema).optional().default([]),
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

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: site } = await supabaseAdmin
          .from("websites")
          .select("id, allowed_origins, permitted_paths")
          .eq("site_key", p.siteKey)
          .maybeSingle();

        if (!site) return new Response("Unknown site", { status: 403, headers });
        if (!originAllowed(origin, site.allowed_origins))
          return new Response("Origin not allowed", { status: 403, headers });
        if (!pathPermitted(p.visit.path, site.permitted_paths))
          return new Response("Page not permitted", { status: 403, headers });

        // 1. Ingest rrweb DOM events batch
        const { error } = await supabaseAdmin.rpc("ingest_batch", {
          _website_id: site.id,
          _session_id: p.sessionId,
          _user_agent: (request.headers.get("user-agent") ?? "").slice(0, 300),
          _visit_id: p.visit.id,
          _module: p.visit.module,
          _url: p.visit.url,
          _path: p.visit.path,
          _started_at: p.visit.startedAt,
          _seq: p.seq,
          _events: p.events as never,
          _ended: !!p.ended,
        });
        if (error) {
          console.error("ingest failed", error.message);
          return new Response("Rejected", { status: 400, headers });
        }

        // 2. Insert OpenTelemetry spans if present
        if (p.spans && p.spans.length > 0) {
          const rows = p.spans.map((s) => ({
            website_id: site.id,
            session_id: p.sessionId,
            visit_id: p.visit.id,
            trace_id: s.trace_id,
            span_id: s.span_id,
            parent_span_id: s.parent_span_id || null,
            name: s.name,
            kind: s.kind,
            status: s.status,
            status_code: s.status_code ?? null,
            start_time: s.start_time,
            end_time: s.end_time,
            duration_ms: s.duration_ms,
            attributes: s.attributes,
          }));

          const { error: spanError } = await (supabaseAdmin as any)
            .from("telemetry_spans")
            .insert(rows as any);

          if (spanError) {
            console.error("failed to insert telemetry spans", spanError.message);
          }
        }

        return new Response("ok", { headers });
      },
    },
  },
});
