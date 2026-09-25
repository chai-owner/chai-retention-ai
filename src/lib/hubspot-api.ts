// Single home for every HubSpot API path and the scope list. Client-safe (no
// secrets, no server imports) so both the connect flow and server code share it.
//
// HubSpot versions endpoints with a dated segment (YYYY-MM). Bumping the
// version is a one-line change here. Never fall back to /crm/v3 at runtime.
//
// Per-user (App User Connector) tokens are user-level tokens: HubSpot refuses
// POST .../search and .../batch/read for them. Every read here is a GET on a
// record list, a single record, or one record's associations.
export const HUBSPOT_API_VERSION = "2026-09";

/**
 * Scopes requested at consent. `crm.objects.contacts.read` is HubSpot's
 * umbrella scope for contacts AND engagements (notes, calls, meetings, tasks,
 * emails) — engagements have no read scope of their own.
 */
export const HUBSPOT_SCOPES = [
  "crm.objects.companies.read",
  "crm.objects.deals.read",
  "crm.objects.contacts.read",
] as const;

/** Scopes a stored connection lacks; non-empty means it must reconnect. */
export function missingHubspotScopes(granted: unknown): string[] {
  const have = new Set(Array.isArray(granted) ? granted.map(String) : []);
  return HUBSPOT_SCOPES.filter((s) => !have.has(s));
}

const V = HUBSPOT_API_VERSION;

export const hubspotPaths = {
  list(objectType: string, params: Record<string, string | undefined>): string {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    return `/crm/objects/${V}/${objectType}?${q.toString()}`;
  },
  associations(objectType: string, id: string, toObjectType: string, after?: string): string {
    const q = new URLSearchParams({ limit: "100" });
    if (after) q.set("after", after);
    return `/crm/objects/${V}/${objectType}/${encodeURIComponent(id)}/associations/${toObjectType}?${q.toString()}`;
  },
  accountDetails(): string {
    return `/account-info/${V}/details`;
  },
};
