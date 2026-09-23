// Source-agnostic content pipeline.
//
// Nothing in this file knows about any provider. It talks to adapters through
// `ContentSourceAdapter`, to the database through `PipelineStore`, and to the
// model through `Extractor`, so it can be unit tested end to end against fakes
// — which is how we prove no provider-specific assumption leaked in.
//
// NOTE ON ACCURACY: the extraction mechanism was validated against constructed
// test examples, not real customer language (see test-set.ts). Signals are
// shown as flags with their quote and are not scored.
import {
  backfillSince,
  isUsableConversation,
  type ContentSourceAdapter,
  type NormalisedConversation,
} from "./source-adapter";
import { prefilterSkipReason } from "./prefilter";
import { quoteIsGrounded, type ExtractedSignal } from "./extract";
import {
  DEFAULT_MONTHLY_CEILING_USD,
  estimateCostUsd,
  isOverCeiling,
  periodKey,
  type UsageSnapshot,
} from "./budget";

export interface StoredConversation {
  id: string;
  source: string;
  externalId: string;
  customerRef: string | null;
  subject: string | null;
  body: string;
  occurredAt: string | null;
}

export interface UsageDelta {
  conversations: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface PipelineStore {
  lastFetchedAt(userId: string, source: string): Promise<string | null>;
  saveConversations(userId: string, rows: NormalisedConversation[]): Promise<number>;
  pendingConversations(userId: string, limit: number): Promise<StoredConversation[]>;
  markSkipped(userId: string, conversationId: string, reason: string): Promise<void>;
  markExtracted(userId: string, conversationId: string, model: string): Promise<void>;
  saveSignals(
    userId: string,
    conversation: StoredConversation,
    signals: ExtractedSignal[],
  ): Promise<number>;
  readUsage(userId: string, period: string): Promise<UsageSnapshot>;
  recordUsage(userId: string, period: string, delta: UsageDelta): Promise<void>;
  pauseUsage(userId: string, period: string): Promise<void>;
}

export interface ExtractionOutcome {
  signals: ExtractedSignal[];
  inputTokens: number;
  outputTokens: number;
}

export interface Extractor {
  readonly model: string;
  run(text: string): Promise<ExtractionOutcome>;
}

export interface RunOptions {
  userId: string;
  adapters: ContentSourceAdapter[];
  store: PipelineStore;
  extractor: Extractor;
  /** Conversations fetched per source per run. */
  fetchLimit?: number;
  /** Conversations sent to the model per run. */
  extractLimit?: number;
  ceilingUsd?: number;
  now?: Date;
}

export interface RunResult {
  sources: string[];
  fetched: number;
  stored: number;
  skipped: number;
  extracted: number;
  signals: number;
  ungroundedDropped: number;
  pausedForBudget: boolean;
  errors: Array<{ source: string; message: string }>;
}

/**
 * One full pass for one account: fetch new text from every connected source,
 * store it, then extract signals from whatever hasn't been read yet.
 */
export async function runContentPipeline(opts: RunOptions): Promise<RunResult> {
  const {
    userId,
    adapters,
    store,
    extractor,
    fetchLimit = 100,
    extractLimit = 100,
    ceilingUsd = DEFAULT_MONTHLY_CEILING_USD,
    now = new Date(),
  } = opts;

  const result: RunResult = {
    sources: [],
    fetched: 0,
    stored: 0,
    skipped: 0,
    extracted: 0,
    signals: 0,
    ungroundedDropped: 0,
    pausedForBudget: false,
    errors: [],
  };

  // 1. Fetch — one connected source at a time. A failing source never stops
  //    the others, and never stops extraction of what's already stored.
  for (const adapter of adapters) {
    try {
      if (!(await adapter.isConnected(userId))) continue;
      result.sources.push(adapter.id);
      const since = (await store.lastFetchedAt(userId, adapter.id)) ?? backfillSince(now);
      const batch = await adapter.fetchConversations({ userId, since, limit: fetchLimit });
      const usable = (batch ?? []).filter(isUsableConversation);
      result.fetched += usable.length;
      if (usable.length) result.stored += await store.saveConversations(userId, usable);
    } catch (e) {
      result.errors.push({ source: adapter.id, message: (e as Error).message });
    }
  }

  // 2. Budget — a paused account stores text but reads none of it.
  const period = periodKey(now);
  const usage = await store.readUsage(userId, period);
  if (usage.pausedAt || isOverCeiling(usage, ceilingUsd)) {
    result.pausedForBudget = true;
    return result;
  }

  // 3. Extract.
  const pending = await store.pendingConversations(userId, extractLimit);
  let spent = usage.estimatedCostUsd;

  for (const conversation of pending) {
    const skip = prefilterSkipReason(conversation.body);
    if (skip) {
      await store.markSkipped(userId, conversation.id, skip);
      result.skipped += 1;
      continue;
    }

    if (spent >= ceilingUsd) {
      result.pausedForBudget = true;
      await store.pauseUsage(userId, period);
      break;
    }

    let outcome: ExtractionOutcome;
    try {
      outcome = await extractor.run(conversation.body);
    } catch (e) {
      result.errors.push({ source: conversation.source, message: (e as Error).message });
      continue;
    }

    // A quote that isn't in the source is not evidence, whatever the model says.
    const grounded = outcome.signals.filter((s) => quoteIsGrounded(s.quote, conversation.body));
    result.ungroundedDropped += outcome.signals.length - grounded.length;

    if (grounded.length) {
      result.signals += await store.saveSignals(userId, conversation, grounded);
    }
    await store.markExtracted(userId, conversation.id, extractor.model);
    result.extracted += 1;

    const cost = estimateCostUsd(outcome.inputTokens, outcome.outputTokens);
    spent += cost;
    await store.recordUsage(userId, period, {
      conversations: 1,
      inputTokens: outcome.inputTokens,
      outputTokens: outcome.outputTokens,
      costUsd: cost,
    });
  }

  return result;
}
