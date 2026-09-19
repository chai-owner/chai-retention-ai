// Lead capture for the public product demo. The browser no longer writes to
// demo_leads directly: this endpoint validates the form, rate limits by IP and
// mints a short-lived access token that unlocks the sample-data demo.
import { createFileRoute } from "@tanstack/react-router";
import {
  clientIpFrom,
  demoTokenExpiry,
  DEMO_RATE_LIMIT_WINDOW_MINUTES,
  generateDemoToken,
  hashIp,
  isDemoRateLimited,
  validateDemoLead,
} from "@/lib/demo-access";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/demo-access")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ error: "Invalid request." }, 400);
        }

        const parsed = validateDemoLead(raw);
        if (!parsed.ok) return json({ error: parsed.message }, 400);
        const lead = parsed.value;

        const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
        const supabase = await getSupabaseAdmin();

        const ipHash = await hashIp(clientIpFrom(request.headers));
        const since = new Date(Date.now() - DEMO_RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString();
        const { count } = await supabase
          .from("demo_lead_attempts")
          .select("id", { count: "exact", head: true })
          .eq("ip_hash", ipHash)
          .gte("created_at", since);

        if (isDemoRateLimited(count ?? 0)) {
          return json(
            { error: "We've had a lot of requests from your network. Please try again later." },
            429,
          );
        }
        await supabase.from("demo_lead_attempts").insert({ ip_hash: ipHash });

        const token = generateDemoToken();
        const expiresAt = demoTokenExpiry().toISOString();

        const { error } = await supabase
          .from("demo_leads")
          .insert({ ...lead, access_token: token, token_expires_at: expiresAt });

        if (error) {
          // Unique index on lower(email): a returning visitor gets a fresh
          // token rather than an error, exactly as before.
          if (error.code === "23505") {
            const { error: updateError } = await supabase
              .from("demo_leads")
              .update({ access_token: token, token_expires_at: expiresAt })
              .ilike("email", lead.email);
            if (updateError) return json({ error: "Couldn't start the demo. Please try again." }, 500);
            return json({ token, expiresAt, returning: true });
          }
          console.error("[demo-access] insert failed", error);
          return json({ error: "Couldn't start the demo. Please try again." }, 500);
        }

        return json({ token, expiresAt, returning: false });
      },
    },
  },
});
