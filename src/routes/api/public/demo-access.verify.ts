// Server-side check that a demo access token is real and unexpired. Called by
// the /app route guard before any sample-data page renders for an anonymous
// visitor, so a copy-pasted ?demo=true URL no longer unlocks the demo.
import { createFileRoute } from "@tanstack/react-router";
import { isDemoTokenExpired } from "@/lib/demo-access";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/demo-access/verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let token = "";
        try {
          const body = (await request.json()) as { token?: unknown };
          token = typeof body.token === "string" ? body.token.trim() : "";
        } catch {
          return json({ valid: false }, 400);
        }
        if (!token || token.length > 128) return json({ valid: false }, 200);

        const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
        const supabase = await getSupabaseAdmin();
        const { data, error } = await supabase
          .from("demo_leads")
          .select("id, token_expires_at")
          .eq("access_token", token)
          .maybeSingle();

        if (error) {
          console.error("[demo-access] verify failed", error);
          return json({ valid: false }, 200);
        }
        if (!data || isDemoTokenExpired(data.token_expires_at)) return json({ valid: false }, 200);

        return json({ valid: true, expiresAt: data.token_expires_at });
      },
    },
  },
});
