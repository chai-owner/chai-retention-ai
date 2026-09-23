import { describe, expect, it } from "vitest";
import { CONSTRUCTED_TEST_SET, SIGNAL_TYPES } from "./test-set";
import { buildExtractionPrompt, parseExtractionResponse, quoteIsGrounded } from "./extract";
import { GATE, combine, metricsFor, passesGate, tally } from "./metrics";

describe("constructed test set", () => {
  it("has unique ids and valid labels", () => {
    const ids = new Set(CONSTRUCTED_TEST_SET.map((e) => e.id));
    expect(ids.size).toBe(CONSTRUCTED_TEST_SET.length);
    for (const e of CONSTRUCTED_TEST_SET) {
      expect(e.text.length).toBeGreaterThan(20);
      for (const l of e.labels) expect(SIGNAL_TYPES).toContain(l);
    }
  });

  it("covers every signal and has a substantial clean set", () => {
    for (const s of SIGNAL_TYPES) {
      expect(CONSTRUCTED_TEST_SET.filter((e) => e.labels.includes(s)).length).toBeGreaterThanOrEqual(15);
    }
    expect(CONSTRUCTED_TEST_SET.filter((e) => e.labels.length === 0).length).toBeGreaterThanOrEqual(20);
    expect(CONSTRUCTED_TEST_SET.length).toBeGreaterThanOrEqual(80);
  });
});

describe("parseExtractionResponse", () => {
  it("parses fenced json and clamps confidence", () => {
    const out = parseExtractionResponse(
      '```json\n{"signals":[{"signal":"competitor_mentioned","quote":"we looked at X","confidence":1.4}]}\n```',
    );
    expect(out).toEqual([{ signal: "competitor_mentioned", quote: "we looked at X", confidence: 1 }]);
  });

  it("drops unknown signals and duplicates, and survives junk", () => {
    expect(
      parseExtractionResponse('{"signals":[{"signal":"nope"},{"signal":"company_distress"},{"signal":"company_distress"}]}'),
    ).toHaveLength(1);
    expect(parseExtractionResponse("sorry, I cannot")).toEqual([]);
    expect(parseExtractionResponse('{"signals": broken')).toEqual([]);
  });

  it("returns an empty list for a clean conversation response", () => {
    expect(parseExtractionResponse('{"signals":[]}')).toEqual([]);
  });
});

describe("quoteIsGrounded", () => {
  it("accepts verbatim spans and rejects invented ones", () => {
    const src = "Customer: We are evaluating another vendor next month.";
    expect(quoteIsGrounded("evaluating another vendor", src)).toBe(true);
    expect(quoteIsGrounded("they said they hate us", src)).toBe(false);
    expect(quoteIsGrounded("no", src)).toBe(false);
  });
});

describe("prompt", () => {
  it("includes every signal definition and the conversation", () => {
    const p = buildExtractionPrompt("hello world");
    for (const s of SIGNAL_TYPES) expect(p).toContain(s);
    expect(p).toContain("hello world");
  });
});

describe("gate scoring", () => {
  it("computes precision, recall and false positives per 100", () => {
    const counts = tally([
      { truth: ["cancellation_intent"], predicted: ["cancellation_intent"] },
      { truth: [], predicted: ["cancellation_intent"] },
      { truth: ["cancellation_intent"], predicted: [] },
      { truth: [], predicted: [] },
    ]);
    const m = metricsFor(counts.cancellation_intent, 4);
    expect(m).toMatchObject({ tp: 1, fp: 1, fn: 1 });
    expect(m.precision).toBeCloseTo(0.5);
    expect(m.recall).toBeCloseTo(0.5);
    expect(m.fpPer100).toBeCloseTo(25);
  });

  it("fails the direct gate on low precision and passes on a clean run", () => {
    expect(passesGate(metricsFor({ tp: 5, fp: 5, fn: 0 }, 100), GATE.direct)).toBe(false);
    expect(passesGate(metricsFor({ tp: 19, fp: 1, fn: 3 }, 100), GATE.direct)).toBe(true);
  });

  it("combines counts across signals", () => {
    expect(combine([{ tp: 1, fp: 2, fn: 3 }, { tp: 4, fp: 5, fn: 6 }])).toEqual({ tp: 5, fp: 7, fn: 9 });
  });
});
