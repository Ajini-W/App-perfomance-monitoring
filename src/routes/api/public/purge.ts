import { createFileRoute } from "@tanstack/react-router";
import type { ResultSetHeader } from "mysql2";
import { db } from "@/lib/mysql";

declare const process: { env: Record<string, string | undefined> };

// Scheduled job target: deletes recordings of sessions whose last activity is older than each
// website's retention_days. Callers must send "Authorization: Bearer <CRON_SECRET>".
export const Route = createFileRoute("/api/public/purge")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["CRON_SECRET"];
        if (!secret) {
          return Response.json(
            { success: false, error: "CRON_SECRET is not configured" },
            { status: 503 },
          );
        }
        if (request.headers.get("authorization") !== `Bearer ${secret}`) {
          return Response.json(
            { success: false, error: "Unauthorized" },
            { status: 401 },
          );
        }

        try {
          // Visits cascade to replay_chunks and telemetry_spans via foreign keys.
          const [result] = await db.execute<ResultSetHeader>(
            `DELETE v FROM visits v
             JOIN websites w ON w.id = v.website_id
             JOIN (
               SELECT session_id, MAX(COALESCE(ended_at, started_at)) AS last_seen
               FROM (SELECT session_id, started_at, ended_at FROM visits) AS all_visits
               GROUP BY session_id
             ) s ON s.session_id = v.session_id
             WHERE s.last_seen < DATE_SUB(?, INTERVAL GREATEST(1, w.retention_days) DAY)`,
            [new Date()],
          );
          return Response.json({
            success: true,
            purged: result.affectedRows,
          });
        } catch (err) {
          console.error(
            "retention purge failed",
            err instanceof Error ? err.message : err,
          );
          return Response.json(
            { success: false, error: "Database error" },
            { status: 500 },
          );
        }
      },
    },
  },
});
