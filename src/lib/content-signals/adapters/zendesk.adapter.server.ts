// Zendesk fetch adapter for the content pipeline.
//
// Like the Intercom adapter, this is the ONLY Zendesk-aware file in the
// content-signals system: it turns Zendesk tickets + their comments into
// `NormalisedConversation` and nothing else. No pipeline file changed to add
// it — it implements the Phase 1 contract and is registered in one line.
//
// Paging/incremental follows the same lessons as the existing Zendesk ticket
// sync: the incremental tickets endpoint with a `start_time` cursor, walking
// `next_page` until `end_of_stream` or the run cap, and going through
// `zendeskApi` so token refresh, 401 retry and 429 Retry-After are handled.
import type {
  ContentSourceAdapter,
  FetchContext,
  NormalisedConversation,
} from "../source-adapter";

/** Comments fetched per ticket page; Zendesk caps at 100. */
const COMMENTS_PER_PAGE = 100;
/** Tickets requested per incremental page; Zendesk's max is 1000. */
const TICKETS_PER_PAGE = 100;
/** Safety stop so a huge Zendesk instance can never spin forever. */
const MAX_PAGES = 20;

interface ZendeskTicket {
  id: number | string;
  subject?: string | null;
  requester_id?: number | string | null;
  organization_id?: number | string | null;
  created_at?: string | null;
  updated_at?: string | null;
  status?: string | null;
}

interface ZendeskComment {
  id?: number | string;
  public?: boolean;
  plain_body?: string | null;
  body?: string | null;
  author_id?: number | string | null;
  created_at?: string | null;
}

/**
 * Zendesk's own stable identifier for the person who raised the ticket. This
 * is the same source id the existing Zendesk ticket sync stores, so signals
 * land on the customer the rest of the product already knows.
 */
export function zendeskCustomerRef(
  ticket: ZendeskTicket,
  requesterEmail?: string | null,
): string | null {
  const ref =
    (ticket.requester_id != null ? String(ticket.requester_id) : "") ||
    (requesterEmail ?? "") ||
    (ticket.organization_id != null ? String(ticket.organization_id) : "");
  return ref ? ref : null;
}

/** Flattens a ticket's comments into "Speaker: text" lines, oldest first. */
export function commentsToText(
  ticket: ZendeskTicket,
  comments: ZendeskComment[],
  nameByAuthorId: Map<string, string> = new Map(),
): string {
  const requesterId = ticket.requester_id != null ? String(ticket.requester_id) : "";
  const lines: string[] = [];
  for (const c of comments) {
    // Internal agent notes are not customer language; they're excluded.
    if (c.public === false) continue;
    const text = String(c.plain_body ?? c.body ?? "")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/[ \t]*\n[ \t]*/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (!text) continue;
    const authorId = c.author_id != null ? String(c.author_id) : "";
    const who =
      nameByAuthorId.get(authorId) ||
      (authorId && authorId === requesterId ? "Customer" : "Support");
    lines.push(`${who}: ${text}`);
  }
  return lines.join("\n\n").trim();
}

export function normaliseZendeskTicket(
  ticket: ZendeskTicket,
  comments: ZendeskComment[],
  nameByAuthorId?: Map<string, string>,
  requesterEmail?: string | null,
): NormalisedConversation {
  const occurred = ticket.updated_at ?? ticket.created_at ?? null;
  return {
    source: "zendesk",
    externalId: String(ticket.id),
    customerRef: zendeskCustomerRef(ticket, requesterEmail),
    subject: ticket.subject ? String(ticket.subject).slice(0, 200) : null,
    body: commentsToText(ticket, comments, nameByAuthorId),
    occurredAt: occurred ? new Date(occurred).toISOString() : null,
  };
}

/**
 * Zendesk rejects an incremental `start_time` within the last minute with a
 * 400 ("too recent"). Two runs close together would otherwise fail outright,
 * so the cursor is always held at least this far back.
 */
export const START_TIME_LAG_SECONDS = 70;

export function zendeskStartTime(since: string | null, now: Date = new Date()): number {
  const requested = Math.floor(new Date(since ?? 0).getTime() / 1000);
  const latest = Math.floor(now.getTime() / 1000) - START_TIME_LAG_SECONDS;
  return Math.max(0, Math.min(Number.isFinite(requested) ? requested : 0, latest));
}

async function admin() {
  const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
  return getSupabaseAdmin();
}


export const zendeskContentAdapter: ContentSourceAdapter = {
  id: "zendesk",
  label: "Zendesk",

  async isConnected(userId: string): Promise<boolean> {
    const db = await admin();
    const { data } = await db
      .from("zendesk_connections")
      .select("id, status")
      .eq("user_id", userId)
      .maybeSingle();
    // A connection needing reauth can't be read from; treat it as not connected
    // so the run reports no error for a problem the user already sees.
    return Boolean(data) && (data?.status ?? "connected") === "connected";
  },

  async fetchConversations(ctx: FetchContext): Promise<NormalisedConversation[]> {
    const { zendeskApi } = await import("@/lib/zendesk.server");

    const startTime = zendeskStartTime(ctx.since);
    const tickets: ZendeskTicket[] = [];
    const nameByAuthorId = new Map<string, string>();
    const emailByUserId = new Map<string, string>();

    let url =
      `/api/v2/incremental/tickets.json?start_time=${startTime}` +
      `&per_page=${TICKETS_PER_PAGE}&include=users`;

    for (let page = 0; page < MAX_PAGES && tickets.length < ctx.limit; page += 1) {
      const json = await zendeskApi<{
        tickets?: ZendeskTicket[];
        users?: Array<{ id?: number | string; name?: string; email?: string }>;
        next_page?: string | null;
        end_of_stream?: boolean;
      }>(ctx.userId, url);

      for (const u of json.users ?? []) {
        if (u.id == null) continue;
        if (u.name) nameByAuthorId.set(String(u.id), String(u.name));
        if (u.email) emailByUserId.set(String(u.id), String(u.email));
      }
      const batch = json.tickets ?? [];
      for (const t of batch) tickets.push(t);

      if (json.end_of_stream || !json.next_page || batch.length === 0) break;
      url = json.next_page;
    }

    // Incremental exports can replay the cursor's own second; ignore anything
    // that isn't actually newer than the cursor.
    const sinceMs = ctx.since ? new Date(ctx.since).getTime() : 0;
    const fresh = tickets.filter((t) => {
      const ts = new Date(t.updated_at ?? t.created_at ?? 0).getTime();
      return !sinceMs || !Number.isFinite(ts) || ts >= sinceMs;
    });

    const out: NormalisedConversation[] = [];
    for (const ticket of fresh.slice(0, ctx.limit)) {
      let comments: ZendeskComment[] = [];
      try {
        const json = await zendeskApi<{ comments?: ZendeskComment[] }>(
          ctx.userId,
          `/api/v2/tickets/${ticket.id}/comments.json?per_page=${COMMENTS_PER_PAGE}`,
        );
        comments = json.comments ?? [];
      } catch {
        // A single unreadable ticket (deleted, restricted) never fails the run.
        continue;
      }
      const row = normaliseZendeskTicket(
        ticket,
        comments,
        nameByAuthorId,
        ticket.requester_id != null
          ? (emailByUserId.get(String(ticket.requester_id)) ?? null)
          : null,
      );
      if (row.body) out.push(row);
    }
    return out;
  },
};
