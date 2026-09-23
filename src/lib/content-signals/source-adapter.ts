// THE SOURCE ADAPTER CONTRACT.
//
// This file is the whole reason a new source is "connect it to the existing
// system" rather than "partially rebuild the system". Every source of free
// text — support connectors (Intercom, Zendesk, Freshdesk), CRM connectors
// (Zoho, HubSpot, Salesforce), and later Data Drop uploads and screenshots —
// implements this one interface and nothing else. Storage, pre-filtering,
// extraction, the signal store, the customer-page UI, erasure and the cost
// ceiling are all written against `NormalisedConversation` and never against
// any provider's own response shape.
//
// Rule for future work: if adding a source requires a change to any file other
// than a new adapter plus one line in the registry, the change belongs here in
// the contract instead.

/** A single piece of free text, in the only shape the pipeline understands. */
export interface NormalisedConversation {
  /** Registry id of the source it came from, e.g. "intercom". */
  source: string;
  /** The provider's own stable id for this conversation/activity/document. */
  externalId: string;
  /**
   * The provider-side customer identifier this text belongs to. Matched
   * against the same identity keys the rest of the product uses (platform id,
   * email, or name). Null means "couldn't be attributed" — the pipeline stores
   * it but no customer page will ever show it.
   */
  customerRef: string | null;
  /** Short title, if the source has one. */
  subject: string | null;
  /** The text itself: all messages in the thread, oldest first, as plain text. */
  body: string;
  /** ISO timestamp of when the exchange happened. Null if the source has none. */
  occurredAt: string | null;
}

export interface FetchContext {
  userId: string;
  /** ISO timestamp of the last successful fetch, or null for a first backfill. */
  since: string | null;
  /** Hard cap on conversations returned in one run. */
  limit: number;
}

export interface ContentSourceAdapter {
  /** Stable registry id; also stored on every row so erasure and UI can label it. */
  readonly id: string;
  /** Human label for the UI, e.g. "Intercom". */
  readonly label: string;
  /** True when this account has the source connected. Cheap check, no fetching. */
  isConnected(userId: string): Promise<boolean>;
  /**
   * Return conversations changed since `since`, newest-first, already
   * normalised. Adapters own their own paging, rate limits and quirks; they
   * must never throw for "nothing to do" — return an empty array.
   */
  fetchConversations(ctx: FetchContext): Promise<NormalisedConversation[]>;
}

/**
 * First-sync backfills are capped rather than reading a customer's entire
 * history — see the cost section of the phased plan.
 */
export const BACKFILL_DAYS = 90;

export function backfillSince(now: Date = new Date()): string {
  return new Date(now.getTime() - BACKFILL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/** Adapters may return junk; the pipeline only accepts rows it can use. */
export function isUsableConversation(c: NormalisedConversation | null | undefined): boolean {
  if (!c) return false;
  if (!c.source || !c.externalId) return false;
  return typeof c.body === "string" && c.body.trim().length > 0;
}
