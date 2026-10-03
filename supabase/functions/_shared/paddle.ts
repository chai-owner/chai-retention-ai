// Ported verbatim from src/lib/paddle.server.ts. Fully self-contained (talks
// directly to Paddle's API with your own API keys — no Lovable dependency).
// Requires PADDLE_SANDBOX_API_KEY / PADDLE_LIVE_API_KEY set as project secrets.
export type PaddleEnv = "sandbox" | "live";

const API_HOSTS: Record<PaddleEnv, string> = {
  sandbox: "https://sandbox-api.paddle.com",
  live: "https://api.paddle.com",
};

function apiKeyFor(env: PaddleEnv): string {
  const key =
    env === "sandbox" ? Deno.env.get("PADDLE_SANDBOX_API_KEY") : Deno.env.get("PADDLE_LIVE_API_KEY");
  if (!key) throw new Error(`Paddle API key missing for ${env}`);
  return key;
}

export async function paddleFetch(env: PaddleEnv, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_HOSTS[env]}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKeyFor(env)}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

export async function resolvePaddlePriceId(env: PaddleEnv, priceId: string): Promise<string> {
  if (priceId.startsWith("pri_")) return priceId;
  const res = await paddleFetch(env, `/prices?external_id=${encodeURIComponent(priceId)}`);
  const json = (await res.json()) as { data?: Array<{ id: string }> };
  const id = json.data?.[0]?.id;
  if (!res.ok || !id) throw new Error(`Paddle price not found: ${priceId}`);
  return id;
}

export async function updateSubscriptionItems(
  env: PaddleEnv,
  subscriptionId: string,
  priceIds: string[],
  prorationMode: "prorated_immediately" | "do_not_bill" | "full_next_billing_period",
): Promise<void> {
  const res = await paddleFetch(env, `/subscriptions/${subscriptionId}`, {
    method: "PATCH",
    body: JSON.stringify({
      items: priceIds.map((price_id) => ({ price_id, quantity: 1 })),
      proration_billing_mode: prorationMode,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Paddle subscription update failed (${res.status}): ${body.slice(0, 300)}`);
  }
}
