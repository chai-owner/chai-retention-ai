// HubSpot fetch adapter for the content pipeline.
//
// The ONLY HubSpot-aware file in the content-signals system: it turns HubSpot
// activities (notes, calls, meetings, tasks, emails) into
// `NormalisedConversation`. Registered in one line in pipeline.server.ts.
//
// Access: per-user App User Connector tokens are HubSpot "user-level" tokens,
// which HubSpot refuses for POST .../search. So "changed since" is applied in
// code over GET list pages (walking `paging.next.after`), exactly like the
// company/deal sync. First sync = the shared 90-day backfill cursor.
//
// Customer attribution mirrors the Zoho activities work: an activity attached
// straight to a company uses that company; otherwise its deal's company, then
// its contact's company. Anything untraceable is dropped. customer_ref is the
// HubSpot company id — the same id the company sync stores as customer_id.
import type {
  ContentSourceAdapter,
  FetchContext,
  NormalisedConversation,
} from "../source-adapter";
import { laggedSinceMs } from "@/lib/sync-cursor";
import { hubspotPaths, missingHubspotScopes } from "@/lib/hubspot-api";
import { htmlToText } from "./intercom.adapter.server";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
const CONNECTOR_ID = "hubspot";
/** Safety stop per activity type: 200 pages × 100 records. */
export const MAX_ACTIVITY_PAGES = 200;

export type HubspotActivityType = "notes" | "calls" | "meetings" | "tasks" | "emails";

export const ACTIVITY_PROPERTIES: Record<HubspotActivityType, string[]> = {
  notes: ["hs_note_body"],
  calls: ["hs_call_title", "hs_call_body"],
  meetings: ["hs_meeting_title", "hs_meeting_body", "hs_internal_meeting_notes"],
  tasks: ["hs_task_subject", "hs_task_body"],
  emails: ["hs_email_subject", "hs_email_text", "hs_email_html", "hs_email_direction"],
};
const COMMON_PROPS = ["hs_timestamp", "hs_lastmodifieddate"];

export interface HubspotActivity {
  id: string;
  properties?: Record<string, string | null | undefined>;
  updatedAt?: string;
  associations?: Record<string, { results?: Array<{ id: string | number }> } | undefined>;
}

function assocIds(a: HubspotActivity, key: string): string[] {
  return (a.associations?.[key]?.results ?? []).map((r) => String(r.id));
}

/** Title + "Speaker: text" body for one activity. Pure; exported for tests. */
export function activityText(
  type: HubspotActivityType,
  a: HubspotActivity,
): { subject: string | null; body: string } {
  const p = a.properties ?? {};
  const t = (v: unknown) => htmlToText(typeof v === "string" ? v : "");
  switch (type) {
    case "notes":
      return { subject: null, body: line("Your team (note)", t(p.hs_note_body)) };
    case "calls":
      return { subject: t(p.hs_call_title) || null, body: line("Your team (call notes)", t(p.hs_call_body)) };
    case "meetings":
      return {
        subject: t(p.hs_meeting_title) || null,
        body: [
          line("Your team (meeting)", t(p.hs_meeting_body)),
          line("Your team (internal meeting notes)", t(p.hs_internal_meeting_notes)),
        ]
          .filter(Boolean)
          .join("\n"),
      };
    case "tasks":
      return { subject: t(p.hs_task_subject) || null, body: line("Your team (task)", t(p.hs_task_body)) };
    case "emails": {
      const incoming = String(p.hs_email_direction ?? "").toUpperCase() === "INCOMING_EMAIL";
      const text = t(p.hs_email_text) || t(p.hs_email_html);
      return {
        subject: t(p.hs_email_subject) || null,
        body: line(incoming ? "Customer (email)" : "Your team (email)", text),
      };
    }
  }
}

function line(speaker: string, text: string): string {
  return text ? `${speaker}: ${text}` : "";
}

/** True when the activity changed at or after the lagged cursor. */
export function changedSince(a: HubspotActivity, sinceMs: number): boolean {
  if (!sinceMs) return true;
  const raw = a.properties?.hs_lastmodifieddate ?? a.updatedAt ?? a.properties?.hs_timestamp;
  const ms = raw ? Date.parse(String(raw)) : NaN;
  return isNaN(ms) || ms >= sinceMs;
}

export interface HubspotAdapterDeps {
  get(path: string): Promise<unknown>;
}

/** Resolves an activity to its company id: company → deal's company → contact's company. */
export async function resolveCompany(
  a: HubspotActivity,
  deps: HubspotAdapterDeps,
  cache: Map<string, string | null>,
): Promise<string | null> {
  const direct = assocIds(a, "companies")[0];
  if (direct) return direct;
  for (const [from, key] of [
    ["deals", "deals"],
    ["contacts", "contacts"],
  ] as const) {
    for (const id of assocIds(a, key)) {
      const ck = `${from}:${id}`;
      if (!cache.has(ck)) {
        const body = (await deps.get(hubspotPaths.associations(from, id, "companies"))) as {
          results?: Array<{ toObjectId?: string | number; id?: string | number }>;
        } | null;
        const first = body?.results?.[0];
        const cid = first ? String(first.toObjectId ?? first.id ?? "") : "";
        cache.set(ck, cid || null);
      }
      const hit = cache.get(ck);
      if (hit) return hit;
    }
  }
  return null;
}

/** Core fetch, dependency-injected so it's testable without the gateway. */
export async function fetchHubspotConversations(
  ctx: FetchContext,
  deps: HubspotAdapterDeps,
): Promise<NormalisedConversation[]> {
  const sinceMs = laggedSinceMs(ctx.since);
  const candidates: Array<{ type: HubspotActivityType; a: HubspotActivity }> = [];

  for (const type of Object.keys(ACTIVITY_PROPERTIES) as HubspotActivityType[]) {
    let after: string | undefined;
    for (let page = 0; page < MAX_ACTIVITY_PAGES; page++) {
      const body = (await deps.get(
        hubspotPaths.list(type, {
          limit: "100",
          properties: [...ACTIVITY_PROPERTIES[type], ...COMMON_PROPS].join(","),
          associations: "companies,deals,contacts",
          after,
        }),
      )) as { results?: HubspotActivity[]; paging?: { next?: { after?: string } } } | null;
      for (const a of body?.results ?? []) {
        if (changedSince(a, sinceMs)) candidates.push({ type, a });
      }
      after = body?.paging?.next?.after;
      if (!after) break;
    }
  }

  // Newest first, capped, before any association lookups (those cost calls).
  const when = (a: HubspotActivity) =>
    Date.parse(String(a.properties?.hs_timestamp ?? a.properties?.hs_lastmodifieddate ?? "")) || 0;
  candidates.sort((x, y) => when(y.a) - when(x.a));

  const cache = new Map<string, string | null>();
  const out: NormalisedConversation[] = [];
  for (const { type, a } of candidates) {
    if (out.length >= ctx.limit) break;
    const { subject, body } = activityText(type, a);
    if (!body.trim()) continue;
    const company = await resolveCompany(a, deps, cache);
    if (!company) continue; // untraceable → dropped
    const ts = a.properties?.hs_timestamp;
    out.push({
      source: CONNECTOR_ID,
      externalId: `${type}-${a.id}`,
      customerRef: company,
      subject,
      body,
      occurredAt: ts ? new Date(String(ts)).toISOString() : null,
    });
  }
  return out;
}

async function gatewayDeps(userId: string): Promise<HubspotAdapterDeps | null> {
  const { getConnectionKeyForUser } = await import("@/lib/app-user-connections.server");
  const key = await getConnectionKeyForUser(userId, CONNECTOR_ID);
  if (!key) return null;
  const { callAsAppUser } = await import("@/integrations/lovable/appUserConnector");
  const { redactSecrets } = await import("@/lib/hubspot.server");
  return {
    async get(path: string) {
      const res = await callAsAppUser({
        gatewayBaseUrl: GATEWAY_BASE_URL,
        connectionAPIKey: key,
        connectorId: CONNECTOR_ID,
        path,
      });
      if (res.status === 204) return null;
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`HubSpot request failed [${res.status}]: ${redactSecrets(text).slice(0, 300)}`);
      }
      return text ? JSON.parse(text) : null;
    },
  };
}

export const hubspotContentAdapter: ContentSourceAdapter = {
  id: CONNECTOR_ID,
  label: "HubSpot",
  async isConnected(userId) {
    const { getConnectionMetaForUser } = await import("@/lib/app-user-connections.server");
    const meta = await getConnectionMetaForUser(userId, CONNECTOR_ID);
    // A connection made before activity access was requested can't read
    // engagements — skip it until the user reconnects (the HubSpot card prompts).
    return !!meta && missingHubspotScopes(meta.metadata.scopes).length === 0;
  },
  async fetchConversations(ctx) {
    const deps = await gatewayDeps(ctx.userId);
    if (!deps) return [];
    return fetchHubspotConversations(ctx, deps);
  },
};
