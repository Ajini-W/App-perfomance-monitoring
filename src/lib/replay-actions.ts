import { createServerFn } from "@tanstack/react-start";
import { db } from "@/lib/mysql";

// 1. Websites பட்டியலை MySQL-ல் இருந்து எடுத்தல்
export const getWebsites = createServerFn({ method: "GET" }).handler(async () => {
  const [rows]: any = await db.execute(
    "SELECT id, name, site_key, allowed_origins, permitted_paths, retention_days, created_at FROM websites ORDER BY created_at ASC"
  );
  return rows.map((r: any) => ({
    ...r,
    allowed_origins: typeof r.allowed_origins === "string" ? JSON.parse(r.allowed_origins) : r.allowed_origins,
    permitted_paths: typeof r.permitted_paths === "string" ? JSON.parse(r.permitted_paths) : r.permitted_paths,
  }));
});

// 2. தேர்ந்தெடுக்கப்பட்ட Website-ன் Visits & Recordings எடுத்தல்
export const getVisits = createServerFn({ method: "GET" })
  .validator((siteId: string) => siteId)
  .handler(async ({ data: siteId }) => {
    if (!siteId) return [];
    const [rows]: any = await db.execute(
      `SELECT v.id, v.website_id, v.session_id, v.user_agent, v.module, v.url, v.path, 
              v.started_at, v.ended_at,
              COALESCE(SUM(JSON_LENGTH(rc.events)), 0) as event_count
       FROM visits v
       LEFT JOIN replay_chunks rc ON rc.visit_id = v.id
       WHERE v.website_id = ?
       GROUP BY v.id
       ORDER BY v.started_at DESC
       LIMIT 500`,
      [siteId]
    );
    return rows.map((r: any) => ({
      ...r,
      module_name: r.module, // UI compatibility-க்காக
    }));
  });

// 3. புதிய Website சேர்த்தல்
export const addWebsite = createServerFn({ method: "POST" })
  .validator((name: string) => name)
  .handler(async ({ data: name }) => {
    const id = crypto.randomUUID();
    const siteKey = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
    await db.execute(
      `INSERT INTO websites (id, name, site_key, allowed_origins, permitted_paths, retention_days)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, name, siteKey, JSON.stringify(["*"]), JSON.stringify(["/*"]), 30]
    );
    return { success: true, id, siteKey };
  });

// 4. Website Settings Update செய்தல்
export const updateWebsiteSettings = createServerFn({ method: "POST" })
  .validator((params: { id: string; origins: string[]; paths: string[]; retention: number }) => params)
  .handler(async ({ data }) => {
    await db.execute(
      `UPDATE websites 
       SET allowed_origins = ?, permitted_paths = ?, retention_days = ?
       WHERE id = ?`,
      [JSON.stringify(data.origins), JSON.stringify(data.paths), data.retention, data.id]
    );
    return { success: true };
  });

// 5. Replay Player-க்காக Visit, Chunks மற்றும் Spans எடுத்தல்
export const getReplayData = createServerFn({ method: "GET" })
  .validator((visitId: string) => visitId)
  .handler(async ({ data: visitId }) => {
    // Visit தகவல்
    const [visits]: any = await db.execute(
      "SELECT * FROM visits WHERE id = ? LIMIT 1",
      [visitId]
    );
    if (!visits || visits.length === 0) return null;
    const visit = { ...visits[0], module_name: visits[0].module };

    // rrweb Events chunks
    const [chunks]: any = await db.execute(
      "SELECT seq, events FROM replay_chunks WHERE visit_id = ? ORDER BY seq ASC",
      [visitId]
    );

    const events: any[] = [];
    for (const chunk of chunks) {
      const parsed = typeof chunk.events === "string" ? JSON.parse(chunk.events) : chunk.events;
      if (Array.isArray(parsed)) events.push(...parsed);
    }
    events.sort((a, b) => a.timestamp - b.timestamp);

    // OpenTelemetry spans
    const [spans]: any = await db.execute(
      "SELECT * FROM telemetry_spans WHERE visit_id = ? ORDER BY start_time ASC",
      [visitId]
    );

    const formattedSpans = spans.map((s: any) => ({
      ...s,
      attributes: typeof s.attributes === "string" ? JSON.parse(s.attributes) : s.attributes,
    }));

    return { visit, events, spans: formattedSpans };
  });
