// Intercom fetch adapter for the content pipeline.
//
// This is the ONLY Intercom-aware file in the content-signals system. It turns
// Intercom's conversation shape into `NormalisedConversation` and nothing else.
// A second source is a sibling file plus one registry line.
import type {
  ContentSourceAdapter,
  FetchContext,
  NormalisedConversation,
} from "../source-adapter";

const INTERCOM_API_VERSION = "2.11";
const PER_PAGE = 50;

interface IntercomPart {
  part_type?: string;
  body?: string | null;
  author?: { type?: string; name?: string | null };
}

interface IntercomConversationDetail {
  id: string | number;
  created_at?: number;
  updated_at?: number;
  source?: {
    subject?: string;
    body?: string | null;
    author?: { email?: string; id?: string; name?: string };
  };
  contacts?: {
    contacts?: Array<{ id?: string; external_id?: string; email?: string; name?: string }>;
  };
  conversation_parts?: { conversation_parts?: IntercomPart[] };
}

/** Intercom message bodies are HTML; the model wants plain text. */
export function htmlToText(html: string | null | undefined): string {
  return String(html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Flattens a conversation into "Speaker: text" lines, oldest first. */
export function conversationToText(detail: IntercomConversationDetail): string {
  const lines: string[] = [];
  const opener = htmlToText(detail.source?.body);
  if (opener) {
    const who = detail.source?.author?.name || "Customer";
    lines.push(`${who}: ${opener}`);
  }
  for (const part of detail.conversation_parts?.conversation_parts ?? []) {
    if (part.part_type && part.part_type !== "comment" && part.part_type !== "note") continue;
    const text = htmlToText(part.body);
    if (!text) continue;
    const who = part.author?.type === "user" || part.author?.type === "lead"
      ? part.author?.name || "Customer"
      : part.author?.name || "Support";
    lines.push(`${who}: ${text}`);
  }
  return lines.join("\n\n").trim();
}

export function customerRefOf(detail: IntercomConversationDetail): string | null {
  const contact = detail.contacts?.contacts?.[0];
  const ref =
    contact?.external_id ||
    contact?.id ||
    (detail.source?.author?.id ? String(detail.source.author.id) : "") ||
    contact?.email ||
    detail.source?.author?.email ||
    "";
  return ref ? String(ref) : null;
}

export function normaliseIntercomConversation(
  detail: IntercomConversationDetail,
): NormalisedConversation {
  const occurred = Number(detail.updated_at ?? detail.created_at ?? 0);
  return {
    source: "intercom",
    externalId: String(detail.id),
    customerRef: customerRefOf(detail),
    subject: detail.source?.subject ? String(detail.source.subject).slice(0, 200) : null,
    body: conversationToText(detail),
    occurredAt: occurred ? new Date(occurred * 1000).toISOString() : null,
  };
}

async function admin() {
  const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
  return getSupabaseAdmin();
}

export const intercomContentAdapter: ContentSourceAdapter = {
  id: "intercom",
  label: "Intercom",

  async isConnected(userId: string): Promise<boolean> {
    const db = await admin();
    const { data } = await db
      .from("intercom_connections")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    return Boolean(data);
  },

  async fetchConversations(ctx: FetchContext): Promise<NormalisedConversation[]> {
    const { decryptSecret } = await import("@/lib/connection-key-crypto.server");
    const { resolveIntercomHost } = await import("@/lib/intercom.server");
    const db = await admin();
    const { data } = await db
      .from("intercom_connections")
      .select("access_token, region, api_host")
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (!data) return [];

    const token = decryptSecret(data.access_token as string);
    const { apiHost } = resolveIntercomHost(
      data.region as string | null,
      data.api_host as string | null,
    );
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "Intercom-Version": INTERCOM_API_VERSION,
    };
    const sinceEpoch = Math.floor(new Date(ctx.since ?? 0).getTime() / 1000);

    // Page the search endpoint until we hit the limit or run out.
    const ids: string[] = [];
    let startingAfter: string | undefined;
    while (ids.length < ctx.limit) {
      const res = await fetch(`https://${apiHost}/conversations/search`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          query: { field: "updated_at", operator: ">", value: sinceEpoch },
          pagination: {
            per_page: Math.min(PER_PAGE, ctx.limit - ids.length),
            ...(startingAfter ? { starting_after: startingAfter } : {}),
          },
          sort: { field: "updated_at", order: "descending" },
        }),
      });
      if (!res.ok) {
        throw new Error(`Intercom search failed [${res.status}]`);
      }
      const json = (await res.json()) as {
        conversations?: Array<{ id: string | number }>;
        pages?: { next?: { starting_after?: string } };
      };
      const page = json.conversations ?? [];
      for (const c of page) ids.push(String(c.id));
      startingAfter = json.pages?.next?.starting_after;
      if (!startingAfter || page.length === 0) break;
    }

    // Search results carry no message bodies; each conversation is fetched.
    const out: NormalisedConversation[] = [];
    for (const id of ids.slice(0, ctx.limit)) {
      const res = await fetch(`https://${apiHost}/conversations/${id}?display_as=plaintext`, {
        headers,
      });
      if (!res.ok) continue;
      const detail = (await res.json()) as IntercomConversationDetail;
      const row = normaliseIntercomConversation(detail);
      if (row.body) out.push(row);
    }
    return out;
  },
};
