import { describe, it, expect } from "vitest";
import { render } from "@react-email/render";
import React from "react";
import {
  applyContentSignals,
  buildContentEntry,
  buildRefResolver,
  contentEntryOf,
  decayFactor,
  groupSignalsByCustomer,
  removeSignalFromSnapshot,
  CONTENT_SIGNAL_WEIGHT,
  type ContentSignalInput,
} from "./scoring";
import { buildDailyBrief } from "@/lib/daily-brief";
import { factorsFromBreakdown, breakdownEntries } from "@/lib/customer-score-snapshot";
import { WeeklyDigestEmail } from "@/lib/email-templates/weekly-digest";
import { PAYMENT_HEALTH_WEIGHT } from "@/lib/payment-health";
import type { CustomerScore } from "@/lib/customer-scoring";

const DAY = 86_400_000;
const NOW = Date.parse("2026-09-25T12:00:00Z");
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

// A customer scored 80 on two ordinary metrics (importance 3 each).
const base = (): CustomerScore => ({
  customer_id: "c1",
  score: 80,
  risk_level: "healthy",
  churn_probability: 7,
  churn_confidence: "moderate",
  score_breakdown: [
    { metric: "Logins", value: 10, normalised: 80, weight: 3, basis: "cohort", baseline: null },
    { metric: "Spend", value: 500, normalised: 80, weight: 3, basis: "cohort", baseline: null },
    {
      metric: "__churn__",
      churn_probability: 7,
      churn_horizon_days: 90,
      confidence: "moderate",
      data_categories: 2,
    },
  ],
});

const sig = (over: Partial<ContentSignalInput>): ContentSignalInput => ({
  id: "s1",
  signal: "competitor_mentioned",
  source: "zendesk",
  confidence: 0.9,
  occurred_at: ago(0),
  ...over,
});

describe("content signal weighting", () => {
  it("is modest: below default metric importance and far below overdue payments", () => {
    expect(CONTENT_SIGNAL_WEIGHT).toBeLessThan(3);
    expect(CONTENT_SIGNAL_WEIGHT).toBeLessThan(PAYMENT_HEALTH_WEIGHT);
  });

  it("a Zendesk signal moves the score down", () => {
    const out = applyContentSignals(base(), [sig({ source: "zendesk" })], NOW);
    expect(out.score).toBeLessThan(80);
    expect(contentEntryOf(out.score_breakdown)?.signals[0]?.source).toBe("zendesk");
  });

  it("a HubSpot signal moves the score by exactly the same amount (same weight per source)", () => {
    const z = applyContentSignals(base(), [sig({ source: "zendesk" })], NOW);
    const h = applyContentSignals(base(), [sig({ source: "hubspot" })], NOW);
    expect(h.score).toBeLessThan(80);
    expect(h.score).toBe(z.score);
  });

  it("even a pile of fresh signals cannot dominate the score", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      sig({ id: `s${i}`, signal: "cancellation_intent", confidence: 1 }),
    );
    const out = applyContentSignals(base(), many, NOW);
    // Worst case: content entry at 0 with weight 1.5 against 6 of metric weight.
    expect(out.score).toBeCloseTo((80 * 6) / (6 + CONTENT_SIGNAL_WEIGHT), 1);
    expect(out.score).toBeGreaterThan(60);
  });

  it("no signals → no content entry and an unchanged score", () => {
    const out = applyContentSignals(base(), [], NOW);
    expect(out.score).toBe(80);
    expect(contentEntryOf(out.score_breakdown)).toBeNull();
  });
});

describe("decay with age", () => {
  it("halves every 30 days and stops at 180", () => {
    expect(decayFactor(0)).toBe(1);
    expect(decayFactor(30)).toBeCloseTo(0.5, 5);
    expect(decayFactor(60)).toBeCloseTo(0.25, 5);
    expect(decayFactor(180)).toBe(0);
  });

  it("an old signal takes less off the score than a fresh one", () => {
    const fresh = applyContentSignals(base(), [sig({ occurred_at: ago(2) })], NOW);
    const old = applyContentSignals(base(), [sig({ occurred_at: ago(90) })], NOW);
    const expired = applyContentSignals(base(), [sig({ occurred_at: ago(200) })], NOW);
    expect(80 - old.score).toBeLessThan(80 - fresh.score);
    expect(old.score).toBeLessThan(80);
    expect(expired.score).toBe(80);
  });
});

describe("dismissal", () => {
  it("dismissed signals contribute nothing", () => {
    expect(buildContentEntry([sig({ dismissed_at: ago(0) })], NOW)).toBeNull();
  });

  it("removing a dismissed signal from a stored snapshot restores the score", () => {
    const withTwo = applyContentSignals(
      base(),
      [sig({ id: "a" }), sig({ id: "b", signal: "cancellation_intent", source: "hubspot" })],
      NOW,
    );
    const afterA = removeSignalFromSnapshot(withTwo, "a", NOW);
    expect(afterA.score).toBeGreaterThan(withTwo.score);
    expect(afterA.score).toBeLessThan(80);
    expect(contentEntryOf(afterA.score_breakdown)?.signals.map((s) => s.id)).toEqual(["b"]);
    const afterBoth = removeSignalFromSnapshot(afterA, "b", NOW);
    expect(afterBoth.score).toBe(80);
    expect(afterBoth.risk_level).toBe("healthy");
    expect(contentEntryOf(afterBoth.score_breakdown)).toBeNull();
  });
});

describe("resolving signals to scored customers", () => {
  it("uses the id, saved links, then company name", () => {
    const resolve = buildRefResolver(
      ["444", "acme"],
      [{ source_id: "zd-9", customer_id: "acme", status: "linked" }],
      { "444": "MapleWorks Software" },
    );
    expect(resolve("444")).toBe("444");
    expect(resolve("zd-9")).toBe("acme");
    expect(resolve("mapleworks software")).toBe("444");
    expect(resolve("unlinked-requester")).toBeNull();
    const grouped = groupSignalsByCustomer(
      [
        { ...sig({ id: "x" }), customer_ref: "zd-9" },
        { ...sig({ id: "y", dismissed_at: ago(0) }), customer_ref: "444" },
        { ...sig({ id: "z" }), customer_ref: "nobody" },
      ],
      resolve,
    );
    expect([...grouped.keys()]).toEqual(["acme"]);
  });
});

describe("labelling in the customer page and digest", () => {
  const scored = applyContentSignals(
    { ...base(), score: 45, score_breakdown: base().score_breakdown.map((e) => ("normalised" in e ? { ...e, normalised: 45 } : e)) },
    [
      sig({ id: "z1", source: "zendesk", signal: "cancellation_intent" }),
      sig({ id: "h1", source: "hubspot", signal: "competitor_mentioned" }),
    ],
    NOW,
  );

  it("customer page: content shows as a separate AI-detected factor, never a hard metric", () => {
    expect(breakdownEntries(scored.score_breakdown).map((e) => e.metric)).toEqual(["Logins", "Spend"]);
    const factors = factorsFromBreakdown(scored.score_breakdown, [], scored.score);
    const ai = factors.filter((f) => f.aiDetected);
    expect(ai).toHaveLength(1);
    expect(ai[0]!.label).toContain("Cancellation intent");
    expect(ai[0]!.label).toContain("Competitor mentioned");
    expect(ai[0]!.detail).toMatch(/Zendesk and HubSpot|HubSpot and Zendesk/);
    expect(factors.filter((f) => !f.aiDetected).every((f) => ["Logins", "Spend"].includes(f.label))).toBe(true);
  });

  it("digest: includes content factors from both sources, labelled by type and source", async () => {
    const brief = buildDailyBrief({
      latest: [{ ...scored, scored_at: ago(0) }],
      names: { c1: "MapleWorks Software" },
    });
    const action = brief.actions[0]!;
    expect(action.topMetric).not.toBe("AI-detected conversation signals");
    expect(action.aiFactors).toEqual(
      expect.arrayContaining([
        { label: "Cancellation intent", source: "Zendesk" },
        { label: "Competitor mentioned", source: "HubSpot" },
      ]),
    );
    const html = await render(
      React.createElement(WeeklyDigestEmail, {
        headline: brief.headline,
        needsAttention: brief.needsAttention,
        criticalCount: brief.criticalCount,
        atRiskCount: brief.atRiskCount,
        movedCount: brief.movedCount,
        declinedCount: brief.declinedCount,
        improvedCount: brief.improvedCount,
        customers: [
          {
            name: action.name,
            score: action.score,
            riskLabel: "At risk",
            topMetric: action.topMetric,
            aiFactors: action.aiFactors,
            action: action.action,
            churnProbability: action.churnProbability,
            confidenceLabel: "Moderate confidence",
          },
        ],
        todayUrl: "https://example.com/app/today",
      }),
    );
    expect(html).toContain("AI-detected");
    expect(html).toMatch(/Cancellation intent.*from.*Zendesk/s);
    expect(html).toMatch(/Competitor mentioned.*from.*HubSpot/s);
    expect(html).toContain("Driving the risk (metric)");
  });
});
