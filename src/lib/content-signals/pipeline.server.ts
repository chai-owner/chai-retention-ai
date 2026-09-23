// Server wiring for the content pipeline: the adapter registry, the Supabase
// store, and the model-backed extractor. The pipeline itself (pipeline.ts)
// stays provider-agnostic; everything provider-shaped lives behind an adapter.
import type { ContentSourceAdapter, NormalisedConversation } from "./source-adapter";
import type {
  Extractor,
  ExtractionOutcome,
  PipelineStore,
  StoredConversation,
  UsageDelta,
} from "./pipeline";
import { runContentPipeline, type RunResult } from "./pipeline";
import { buildExtractionPrompt, parseExtractionResponse } from "./extract";
import { approxTokens, periodKey, type UsageSnapshot } from "./budget";
import { readServerEnv } from "@/lib/server-env";

/**
 * THE REGISTRY. Adding a source = write an adapter file, add it here. Nothing
 * else in the system changes.
 */
export async function contentAdapters(): Promise<ContentSourceAdapter[]> {
  const { intercomContentAdapter } = await import("./adapters/intercom.adapter.server");
  return [intercomContentAdapter];
  // Phase 2: zendeskContentAdapter, freshdeskContentAdapter
  // Phase 4: zohoContentAdapter, hubspotContentAdapter, salesforceContentAdapter
  // Phase 5: dataDropContentAdapter
}

async function admin() {
  const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
  return getSupabaseAdmin();
}

export const DEFAULT_MODEL = "google/gemini-3-flash-preview";

export function createGatewayExtractor(model: string = DEFAULT_MODEL): Extractor {
  return {
    model,
    async run(text: string): Promise<ExtractionOutcome> {
      const key = readServerEnv("LOVABLE_API_KEY");
      if (!key) throw new Error("AI is not configured for this workspace.");
      const prompt = buildExtractionPrompt(text);
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0,
        }),
      });
      if (res.status === 429) throw new Error("AI rate limit reached — try again shortly.");
      if (!res.ok) throw new Error(`AI request failed [${res.status}]`);
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const raw = json.choices?.[0]?.message?.content ?? "";
      return {
        signals: parseExtractionResponse(raw),
        inputTokens: json.usage?.prompt_tokens ?? approxTokens(prompt),
        outputTokens: json.usage?.completion_tokens ?? approxTokens(raw),
      };
    },
  };
}

export function createSupabaseStore(db: Awaited<ReturnType<typeof admin>>): PipelineStore {
  return {
    async lastFetchedAt(userId, source) {
      const { data } = await db
        .from("content_conversations")
        .select("fetched_at")
        .eq("user_id", userId)
        .eq("source", source)
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data?.fetched_at as string | undefined) ?? null;
    },

    async saveConversations(userId, rows: NormalisedConversation[]) {
      const now = new Date().toISOString();
      const payload = rows.map((r) => ({
        user_id: userId,
        source: r.source,
        external_id: r.externalId,
        customer_ref: r.customerRef,
        subject: r.subject,
        body: r.body,
        occurred_at: r.occurredAt,
        fetched_at: now,
        // Re-fetched text is read again; a changed thread can carry a new signal.
        extracted_at: null,
        skipped_reason: null,
      }));
      const { data, error } = await db
        .from("content_conversations")
        .upsert(payload, { onConflict: "user_id,source,external_id" })
        .select("id");
      if (error) throw new Error(`content_conversations: ${error.message}`);
      return (data ?? []).length;
    },

    async pendingConversations(userId, limit) {
      const { data, error } = await db
        .from("content_conversations")
        .select("id, source, external_id, customer_ref, subject, body, occurred_at")
        .eq("user_id", userId)
        .is("extracted_at", null)
        .is("skipped_reason", null)
        .order("occurred_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(`content_conversations: ${error.message}`);
      return (data ?? []).map(
        (r): StoredConversation => ({
          id: r.id as string,
          source: r.source as string,
          externalId: r.external_id as string,
          customerRef: (r.customer_ref as string | null) ?? null,
          subject: (r.subject as string | null) ?? null,
          body: (r.body as string) ?? "",
          occurredAt: (r.occurred_at as string | null) ?? null,
        }),
      );
    },

    async markSkipped(userId, conversationId, reason) {
      await db
        .from("content_conversations")
        .update({ skipped_reason: reason })
        .eq("user_id", userId)
        .eq("id", conversationId);
    },

    async markExtracted(userId, conversationId, model) {
      await db
        .from("content_conversations")
        .update({ extracted_at: new Date().toISOString(), extraction_model: model })
        .eq("user_id", userId)
        .eq("id", conversationId);
    },

    async saveSignals(userId, conversation, signals) {
      const payload = signals.map((s) => ({
        user_id: userId,
        conversation_id: conversation.id,
        source: conversation.source,
        external_id: conversation.externalId,
        customer_ref: conversation.customerRef,
        signal: s.signal,
        quote: s.quote.slice(0, 500),
        confidence: s.confidence,
        occurred_at: conversation.occurredAt,
      }));
      const { data, error } = await db
        .from("content_risk_signals")
        .upsert(payload, { onConflict: "user_id,source,external_id,signal" })
        .select("id");
      if (error) throw new Error(`content_risk_signals: ${error.message}`);
      return (data ?? []).length;
    },

    async readUsage(userId, period): Promise<UsageSnapshot> {
      const { data } = await db
        .from("content_extraction_usage")
        .select("period, conversations_extracted, estimated_cost_usd, paused_at")
        .eq("user_id", userId)
        .eq("period", period)
        .maybeSingle();
      return {
        period,
        conversationsExtracted: Number(data?.conversations_extracted ?? 0),
        estimatedCostUsd: Number(data?.estimated_cost_usd ?? 0),
        pausedAt: (data?.paused_at as string | null) ?? null,
      };
    },

    async recordUsage(userId, period, delta: UsageDelta) {
      const current = await this.readUsage(userId, period);
      const { data } = await db
        .from("content_extraction_usage")
        .select("input_tokens, output_tokens")
        .eq("user_id", userId)
        .eq("period", period)
        .maybeSingle();
      await db.from("content_extraction_usage").upsert(
        {
          user_id: userId,
          period,
          conversations_extracted: current.conversationsExtracted + delta.conversations,
          input_tokens: Number(data?.input_tokens ?? 0) + delta.inputTokens,
          output_tokens: Number(data?.output_tokens ?? 0) + delta.outputTokens,
          estimated_cost_usd: Number((current.estimatedCostUsd + delta.costUsd).toFixed(6)),
        },
        { onConflict: "user_id,period" },
      );
    },

    async pauseUsage(userId, period) {
      await db
        .from("content_extraction_usage")
        .upsert(
          { user_id: userId, period, paused_at: new Date().toISOString() },
          { onConflict: "user_id,period" },
        );
    },
  };
}

/** One pass for one account, using the real registry, store and model. */
export async function runContentExtractionForUser(
  userId: string,
  opts: { fetchLimit?: number; extractLimit?: number } = {},
): Promise<RunResult> {
  const db = await admin();
  return runContentPipeline({
    userId,
    adapters: await contentAdapters(),
    store: createSupabaseStore(db),
    extractor: createGatewayExtractor(),
    fetchLimit: opts.fetchLimit ?? 100,
    extractLimit: opts.extractLimit ?? 50,
    now: new Date(),
  });
}

/**
 * Retention: bodies are dropped after their 90-day window, leaving the signal
 * and its quote behind. Safe to call repeatedly.
 */
export async function expireConversationBodies(): Promise<number> {
  const db = await admin();
  const { data, error } = await db
    .from("content_conversations")
    .update({ body: "", skipped_reason: "expired" })
    .lt("body_expires_at", new Date().toISOString())
    .neq("body", "")
    .select("id");
  if (error) throw new Error(`content_conversations: ${error.message}`);
  return (data ?? []).length;
}

export { periodKey };
