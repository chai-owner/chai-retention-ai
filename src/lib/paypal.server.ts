// Server-only PayPal REST helpers. Used to verify a subscription ID that the
// browser reports back after checkout, so we never trust the client blindly.
const LIVE_API = "https://api-m.paypal.com";
const SANDBOX_API = "https://api-m.sandbox.paypal.com";

function apiBase() {
  return process.env["PAYPAL_ENVIRONMENT"] === "sandbox" ? SANDBOX_API : LIVE_API;
}

export function paypalConfigured() {
  return Boolean(process.env["PAYPAL_CLIENT_ID"] && process.env["PAYPAL_CLIENT_SECRET"]);
}

async function getAccessToken(): Promise<string> {
  const id = process.env["PAYPAL_CLIENT_ID"];
  const secret = process.env["PAYPAL_CLIENT_SECRET"];
  if (!id || !secret) throw new Error("PayPal credentials are not configured");
  const res = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`PayPal auth failed [${res.status}]: ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

export interface PaypalSubscription {
  id: string;
  status: string;
  plan_id?: string;
  subscriber?: { email_address?: string };
  billing_info?: {
    next_billing_time?: string;
    last_payment?: { amount?: { value?: string; currency_code?: string } };
  };
  [key: string]: unknown;
}

export async function fetchPaypalSubscription(subscriptionId: string): Promise<PaypalSubscription> {
  const token = await getAccessToken();
  const res = await fetch(
    `${apiBase()}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`,
    { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } },
  );
  if (!res.ok) {
    throw new Error(`PayPal subscription lookup failed [${res.status}]: ${await res.text()}`);
  }
  return (await res.json()) as PaypalSubscription;
}

export async function cancelPaypalSubscription(subscriptionId: string, reason: string) {
  const token = await getAccessToken();
  const res = await fetch(
    `${apiBase()}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    },
  );
  if (!res.ok && res.status !== 204) {
    throw new Error(`PayPal cancel failed [${res.status}]: ${await res.text()}`);
  }
}
