import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Scheduled job target: deletes sessions older than each website's retention_days.
// Scheduled via a managed HTTP schedule; callers must present the cron bearer secret.
export const Route = createFileRoute("/api/public/purge")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("purge_expired_sessions");
        if (error) {
          console.error("retention purge failed", error.message);
          return Response.json({ success: false, error: error.message }, { status: 500 });
        }
        return Response.json({ success: true, purged: (data as unknown[] | null)?.length ?? 0 });
      },
    },
  },
});
