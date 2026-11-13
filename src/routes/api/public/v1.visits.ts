import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey } from "@/lib/api-key-middleware";
import { db } from "@/lib/mysql";

const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin ?? "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
  Vary: "Origin",
});

export const Route = createFileRoute("/api/public/v1/visits")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: cors(request.headers.get("origin")) }),

      GET: async ({ request }) => {
        const origin = request.headers.get("origin");
        const headers = cors(origin);

        // 1. Authenticate API Key
        const auth = await authenticateApiKey(request);
        if (!auth.success) {
          return Response.json(
            { success: false, error: auth.error, code: auth.code },
            { status: auth.status, headers }
          );
        }

        const { client } = auth;
        const url = new URL(request.url);
        const siteId = url.searchParams.get("siteId");

        try {
          // 2. Query data strictly belonging to this authenticated client (Multi-Tenant Isolation)
          let query = `
            SELECT v.id, v.website_id, w.name as website_name, v.session_id, v.module, 
                   v.url, v.path, v.started_at, v.ended_at, v.user_agent
            FROM visits v
            JOIN websites w ON w.id = v.website_id
            WHERE w.client_id = ?
          `;
          const params: any[] = [client.clientId];

          if (siteId) {
            query += " AND v.website_id = ?";
            params.push(siteId);
          }

          query += " ORDER BY v.started_at DESC LIMIT 100";

          const [rows]: any = await db.execute(query, params);

          return Response.json(
            {
              success: true,
              client: { id: client.clientId, name: client.clientName },
              count: rows.length,
              data: rows,
            },
            { status: 200, headers }
          );
        } catch (err) {
          console.error("[api] Failed to fetch visits:", err);
          return Response.json(
            { success: false, error: "Database query error", code: "DATABASE_ERROR" },
            { status: 500, headers }
          );
        }
      },
    },
  },
});
