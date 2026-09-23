// The pipeline is tested against a FAKE adapter — no Intercom, no provider
// shape anywhere — which is what proves a new source is "write an adapter"
// rather than "change the pipeline".
import { describe, it, expect } from "vitest";
import { runContentPipeline, type PipelineStore, type StoredConversation } from "./pipeline";
import type { ContentSourceAdapter, NormalisedConversation } from "../content-signals/source-adapter";
import { prefilterSkipReason, shouldExtract } from "./prefilter";
import { estimateCostUsd, periodKey, isOverCeiling } from "./budget";
import {
  conversationToText,
  htmlToText,
  normaliseIntercomConversation,
} from "./adapters/intercom.adapter.server";

function fakeAdapter(
  id: string,
  rows: NormalisedConversation[],
  connected = true,
): ContentSourceAdapter {
  return {
    id,
    label: id,
    isConnected: async () => connected,
    fetchConversations: async () => rows,
  };
}

function memoryStore(seed: StoredConversation[] = []) {
  const state = {
    saved: [] as NormalisedConversation[],
    pending: [...seed],
    skipped: [] as Array<{ id: string; reason: string }>,
    extracted: [] as string[],
    signals: [] as Array<{ conversation: string; signal: string }>,
    usage: { period: periodKey(), conversationsExtracted: 0, estimatedCostUsd: 0, pausedAt: null as string | null },
  };
  const store: PipelineStore = {
    lastFetchedAt: async () => null,
    saveConversations: async (_u, rows) => {
      state.saved.push(...rows);
      return rows.length;
    },
    pendingConversations: async (_u, limit) => state.pending.slice(0, limit),
    markSkipped: async (_u, id, reason) => void state.skipped.push({ id, reason }),
    markExtracted: async (_u, id) => void state.extracted.push(id),
    saveSignals: async (_u, conv, signals) => {
      for (const s of signals) state.signals.push({ conversation: conv.id, signal: s.signal });
      return signals.length;
    },
    readUsage: async () => ({ ...state.usage }),
    recordUsage: async (_u, _p, delta) => {
      state.usage.conversationsExtracted += delta.conversations;
      state.usage.estimatedCostUsd += delta.costUsd;
    },
    pauseUsage: async () => {
      state.usage.pausedAt = new Date().toISOString();
    },
  };
  return { state, store };
}

const conv = (id: string, body: string): StoredConversation => ({
  id,
  source: "fake",
  externalId: `ext-${id}`,
  customerRef: "cust-1",
  subject: null,
  body,
  occurredAt: "2026-09-01T00:00:00.000Z",
});

const RICH = "We are seriously evaluating another vendor because renewal is coming up soon.";

const extractor = {
  model: "test-model",
  run: async (text: string) => ({
    signals: text.includes("another vendor")
      ? [{ signal: "competitor_mentioned" as const, quote: "evaluating another vendor", confidence: 0.9 }]
      : [],
    inputTokens: 100,
    outputTokens: 20,
  }),
};

describe("content pipeline (source-agnostic)", () => {
  it("fetches from any adapter and stores normalised rows", async () => {
    const { state, store } = memoryStore();
    const rows: NormalisedConversation[] = [
      { source: "fake", externalId: "a", customerRef: "c", subject: "s", body: RICH, occurredAt: null },
    ];
    const result = await runContentPipeline({
      userId: "u1",
      adapters: [fakeAdapter("fake", rows)],
      store,
      extractor,
    });
    expect(result.fetched).toBe(1);
    expect(state.saved).toHaveLength(1);
    expect(result.sources).toEqual(["fake"]);
  });

  it("ignores disconnected sources and unusable rows", async () => {
    const { store } = memoryStore();
    const result = await runContentPipeline({
      userId: "u1",
      adapters: [
        fakeAdapter("off", [{ source: "off", externalId: "x", customerRef: null, subject: null, body: RICH, occurredAt: null }], false),
        fakeAdapter("fake", [{ source: "fake", externalId: "", customerRef: null, subject: null, body: "", occurredAt: null }]),
      ],
      store,
      extractor,
    });
    expect(result.sources).toEqual(["fake"]);
    expect(result.fetched).toBe(0);
  });

  it("one failing source never stops the others", async () => {
    const { store } = memoryStore();
    const broken: ContentSourceAdapter = {
      id: "broken",
      label: "broken",
      isConnected: async () => true,
      fetchConversations: async () => {
        throw new Error("provider down");
      },
    };
    const good = fakeAdapter("good", [
      { source: "good", externalId: "g1", customerRef: "c", subject: null, body: RICH, occurredAt: null },
    ]);
    const result = await runContentPipeline({ userId: "u1", adapters: [broken, good], store, extractor });
    expect(result.errors[0]?.source).toBe("broken");
    expect(result.fetched).toBe(1);
  });

  it("extracts signals and marks conversations read", async () => {
    const { state, store } = memoryStore([conv("1", RICH)]);
    const result = await runContentPipeline({ userId: "u1", adapters: [], store, extractor });
    expect(result.extracted).toBe(1);
    expect(result.signals).toBe(1);
    expect(state.extracted).toEqual(["1"]);
    expect(state.usage.conversationsExtracted).toBe(1);
  });

  it("drops a signal whose quote is not in the source text", async () => {
    const { store } = memoryStore([conv("1", "Renewal is coming up and we may look around.")]);
    const hallucinating = {
      model: "test-model",
      run: async () => ({
        signals: [{ signal: "competitor_mentioned" as const, quote: "we signed with Acme", confidence: 0.9 }],
        inputTokens: 10,
        outputTokens: 5,
      }),
    };
    const result = await runContentPipeline({ userId: "u1", adapters: [], store, extractor: hallucinating });
    expect(result.signals).toBe(0);
    expect(result.ungroundedDropped).toBe(1);
  });

  it("skips short and automated text without paying a model", async () => {
    const { state, store } = memoryStore([conv("1", "thanks!"), conv("2", "Automatic reply: I am away until Monday.")]);
    const result = await runContentPipeline({ userId: "u1", adapters: [], store, extractor });
    expect(result.skipped).toBe(2);
    expect(result.extracted).toBe(0);
    expect(state.skipped.map((s) => s.reason)).toEqual(["too_short", "automated"]);
  });

  it("stops extracting when the monthly ceiling is already reached", async () => {
    const { state, store } = memoryStore([conv("1", RICH)]);
    state.usage.estimatedCostUsd = 10;
    const result = await runContentPipeline({ userId: "u1", adapters: [], store, extractor, ceilingUsd: 5 });
    expect(result.pausedForBudget).toBe(true);
    expect(result.extracted).toBe(0);
  });
});

describe("prefilter", () => {
  it("keeps genuine text", () => {
    expect(shouldExtract(RICH)).toBe(true);
    expect(prefilterSkipReason(RICH)).toBeNull();
  });
  it("drops pleasantries and out-of-office", () => {
    expect(prefilterSkipReason("Thanks!")).toBe("too_short");
    expect(prefilterSkipReason("Out of office until 4 October, please contact my colleague.")).toBe("automated");
  });
});

describe("budget", () => {
  it("prices a run and detects the ceiling", () => {
    expect(estimateCostUsd(1_000_000, 0)).toBeCloseTo(0.3, 5);
    expect(isOverCeiling({ estimatedCostUsd: 5 }, 5)).toBe(true);
    expect(isOverCeiling({ estimatedCostUsd: 1 }, 5)).toBe(false);
  });
  it("keys usage by calendar month", () => {
    expect(periodKey(new Date("2026-09-23T10:00:00Z"))).toBe("2026-09");
  });
});

describe("intercom adapter normalisation", () => {
  it("turns HTML message bodies into plain text", () => {
    expect(htmlToText("<p>Hi&nbsp;there</p><p>We&#39;re leaving</p>")).toBe("Hi there\n\nWe're leaving");
  });

  it("flattens a thread oldest-first with speakers", () => {
    const text = conversationToText({
      id: 1,
      source: { body: "<p>Renewal question</p>", author: { name: "Dana", type: "user" } as never },
      conversation_parts: {
        conversation_parts: [
          { part_type: "comment", body: "<p>Happy to help</p>", author: { type: "admin", name: "Sam" } },
          { part_type: "assignment", body: null, author: { type: "admin" } },
        ],
      },
    } as never);
    expect(text).toBe("Dana: Renewal question\n\nSam: Happy to help");
  });

  it("normalises to the shared shape", () => {
    const row = normaliseIntercomConversation({
      id: 42,
      updated_at: 1758585600,
      source: { subject: "Renewal", body: "<p>We may not renew</p>" },
      contacts: { contacts: [{ external_id: "acct-9", email: "d@x.com" }] },
    } as never);
    expect(row).toMatchObject({ source: "intercom", externalId: "42", customerRef: "acct-9", subject: "Renewal" });
    expect(row.body).toContain("We may not renew");
    expect(row.occurredAt).toMatch(/^2025-|^2026-/);
  });
});
