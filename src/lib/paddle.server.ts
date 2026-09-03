// Server-only Paddle utilities. API calls go straight to the Paddle API using
// the provisioned per-environment API keys (PADDLE_SANDBOX_API_KEY /
// PADDLE_LIVE_API_KEY). Never import this module from client code.

import { createHmac, timingSafeEqual } from "crypto";

export type PaddleEnv = "sandbox" | "live";

const API_HOSTS: Record<PaddleEnv, string> = {
  sandbox: "https://sandbox-api.paddle.com",
  live: "https://api.paddle.com",
};

function apiKeyFor(env: PaddleEnv): string {
  const key =
    env === "sandbox" ? process.env["PADDLE_SANDBOX_API_KEY"] : process.env["PADDLE_LIVE_API_KEY"];
  if (!key) throw new Error(`Paddle API key missing for ${env}`);
  return key;
}

/** Authenticated fetch against the Paddle API. */
export async function paddleFetch(env: PaddleEnv, path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${API_HOSTS[env]}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKeyFor(env)}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  return res;
}

/**
 * Resolve a price reference to Paddle's internal pri_ ID. Our catalog is
 * referenced by pri_ ID directly, so this is a pass-through; legacy
 * human-readable external IDs still fall back to a lookup.
 */
export async function resolvePaddlePriceId(env: PaddleEnv, priceId: string): Promise<string> {
  if (priceId.startsWith("pri_")) return priceId;
  const res = await paddleFetch(env, `/prices?external_id=${encodeURIComponent(priceId)}`);
  const json = (await res.json()) as { data?: Array<{ id: string }> };
  const id = json.data?.[0]?.id;
  if (!res.ok || !id) throw new Error(`Paddle price not found: ${priceId}`);
  return id;
}

export const EventName = {
  SubscriptionCreated: "subscription.created",
  SubscriptionUpdated: "subscription.updated",
  SubscriptionCanceled: "subscription.canceled",
  TransactionCompleted: "transaction.completed",
  TransactionPaymentFailed: "transaction.payment_failed",
} as const;

export interface PaddleEvent {
  eventType: string;
  data: any;
}

function webhookSecretFor(env: PaddleEnv): string {
  const secret =
    env === "sandbox"
      ? process.env["PAYMENTS_SANDBOX_WEBHOOK_SECRET"]
      : process.env["PAYMENTS_LIVE_WEBHOOK_SECRET"];
  if (!secret) throw new Error(`Paddle webhook secret missing for ${env}`);
  return secret;
}

/**
 * Verify the Paddle-Signature header and return the parsed event.
 * Header shape: `ts=1700000000;h1=abc...,h2=...` — the signed payload is
 * `${ts}:${rawBody}` with HMAC-SHA256. Throws on any mismatch.
 */
export async function verifyWebhook(request: Request, env: PaddleEnv): Promise<PaddleEvent> {
  const header = request.headers.get("Paddle-Signature") ?? "";
  const parts = Object.fromEntries(
    header
      .split(";")
      .map((p) => p.trim().split("="))
      .filter((kv) => kv.length === 2) as Array<[string, string]>,
  );
  const ts = parts["ts"];
  const h1 = parts["h1"];
  if (!ts || !h1) throw new Error("Missing Paddle-Signature fields");

  // Reject events older than 5 minutes to blunt replay attacks.
  const ageMs = Math.abs(Date.now() - Number(ts) * 1000);
  if (!Number.isFinite(ageMs) || ageMs > 5 * 60 * 1000) throw new Error("Stale webhook timestamp");

  const rawBody = await request.text();
  const expected = createHmac("sha256", webhookSecretFor(env)).update(`${ts}:${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(h1);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Invalid webhook signature");

  return JSON.parse(rawBody) as PaddleEvent;
}

/** Create a hosted customer-portal session; returns the overview URL. */
export async function createPortalSession(
  env: PaddleEnv,
  customerId: string,
  subscriptionIds: string[],
): Promise<string> {
  const res = await paddleFetch(env, `/customers/${customerId}/portal-sessions`, {
    method: "POST",
    body: JSON.stringify({ subscription_ids: subscriptionIds }),
  });
  const json = (await res.json()) as { data?: { urls?: { general?: { overview?: string } } }; error?: unknown };
  const url = json.data?.urls?.general?.overview;
  if (!res.ok || !url) throw new Error("Couldn't create a billing portal session");
  return url;
}

/** Swap the items on a subscription (plan change). */
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
