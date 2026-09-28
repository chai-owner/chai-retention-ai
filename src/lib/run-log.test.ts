import { describe, it, expect } from "vitest";
import { classifyError, sanitizeEntry, retentionCutoff } from "./run-log";
import { runContentPipeline, type PipelineStore } from "./content-signals/pipeline";

describe("classifyError never keeps the message", () => {
  it("maps known failures to fixed types", () => {
    expect(classifyError(new Error("Request timed out after 30s"))).toBe("timeout");
    expect(classifyError(new Error("HubSpot 429 Too Many Requests"))).toBe("rate_limit");
    expect(classifyError(new Error("401 Unauthorized"))).toBe("auth");
    expect(classifyError(new Error("fetch failed"))).toBe("network");
    expect(classifyError(new Error("Zoho 503 Service Unavailable"))).toBe("provider_error");
  });
  it("returns only a category, even when the message holds customer text", () => {
    const t = classifyError(new Error('Ticket "Acme Corp is moving to Competitor X" rejected'));
    expect(t).toMatch(/^[a-z_]+$/);
    expect(t).not.toContain("Acme");
  });
  it("falls back to unknown", () => {
    expect(classifyError(undefined)).toBe("unknown");
    expect(classifyError(new Error("something odd"))).toBe("unknown");
  });
});

describe("sanitizeEntry", () => {
  it("drops free text and bad numbers", () => {
    const e = sanitizeEntry({
      user_id: "not-a-uuid",
      source: "crm",
      provider: "Jane Smith at Acme said we're cancelling",
      step: "sync",
      ok: false,
      rows_read: -3,
      rows_saved: 4.6,
      error_type: "leaked text" as never,
      // extra fields must not pass through
      ...({ message: "customer quote" } as object),
    });
    expect(e.user_id).toBeNull();
    expect(e.provider).toBe("invalid");
    expect(e.rows_read).toBeNull();
    expect(e.rows_saved).toBe(5);
    expect(e.error_type).toBe("unknown");
    expect(JSON.stringify(e)).not.toContain("quote");
  });
  it("keeps clean entries", () => {
    const e = sanitizeEntry({
      user_id: "5debf9d7-bcd9-4485-b9b8-27c247cba6bb",
      source: "content", provider: "hubspot", step: "read_conversations", ok: true, rows_read: 0,
    });
    expect(e).toMatchObject({ provider: "hubspot", rows_read: 0, error_type: null });
  });
});

describe("retention", () => {
  it("cuts off at 90 days", () => {
    expect(retentionCutoff(new Date("2026-12-30T00:00:00Z"))).toBe("2026-10-01T00:00:00.000Z");
  });
});

describe("pipeline per-source counts", () => {
  it("gives every connected source its own line, including zero-result nights", async () => {
    const store: PipelineStore = {
      lastFetchedAt: async () => null,
      saveConversations: async (_u, rows) => rows.length,
      readUsage: async () => ({ conversationsExtracted: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, pausedAt: null }),
      pendingConversations: async () => [],
      markSkipped: async () => {},
      markExtracted: async () => {},
      saveSignals: async () => 0,
      recordUsage: async () => {},
      pauseUsage: async () => {},
    } as unknown as PipelineStore;
    const adapter = (id: string, fail = false) => ({
      id,
      isConnected: async () => true,
      fetchConversations: async () => {
        if (fail) throw new Error("401 Unauthorized");
        return [];
      },
    });
    const r = await runContentPipeline({
      userId: "u",
      adapters: [adapter("hubspot"), adapter("zendesk", true)] as never,
      store,
      extractor: { model: "m", run: async () => ({ signals: [], inputTokens: 0, outputTokens: 0 }) },
    });
    expect(r.bySource.hubspot).toMatchObject({ fetched: 0, errors: 0 });
    expect(r.bySource.zendesk).toMatchObject({ errors: 1 });
  });
});
