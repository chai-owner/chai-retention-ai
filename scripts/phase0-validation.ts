// Phase 0 validation run — CONSTRUCTED TEST EXAMPLES ONLY.
//
// Runs the content-signal extraction over src/lib/content-signals/test-set.ts
// and scores it against the agreed gate. The examples are hand-written, not
// real customer language: any result from this script must be reported as
// "validated against constructed test examples".
//
//   bun run scripts/phase0-validation.ts
import { CONSTRUCTED_TEST_SET, SIGNAL_TYPES, type SignalType } from "../src/lib/content-signals/test-set";
import { buildExtractionPrompt, parseExtractionResponse, quoteIsGrounded } from "../src/lib/content-signals/extract";
import {
  CIRCUMSTANTIAL_SIGNALS,
  DIRECT_SIGNALS,
  GATE,
  combine,
  metricsFor,
  passesGate,
  tally,
} from "../src/lib/content-signals/metrics";

const MODEL = process.env["PHASE0_MODEL"] ?? "google/gemini-3-flash-preview";
const KEY = process.env["LOVABLE_API_KEY"];
if (!KEY) throw new Error("LOVABLE_API_KEY missing");

interface RunCase {
  id: string;
  truth: SignalType[];
  predicted: SignalType[];
  difficulty: string;
  quotes: Record<string, { quote: string; confidence: number; grounded: boolean }>;
  text: string;
}

async function extract(text: string): Promise<{ raw: string; signals: ReturnType<typeof parseExtractionResponse> }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": KEY! },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: buildExtractionPrompt(text) }],
        temperature: 0,
      }),
    });
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`gateway ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content ?? "";
    return { raw, signals: parseExtractionResponse(raw) };
  }
  throw new Error("gateway retries exhausted");
}

const cases: RunCase[] = [];
const CONCURRENCY = 6;
let cursor = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < CONSTRUCTED_TEST_SET.length) {
      const ex = CONSTRUCTED_TEST_SET[cursor++]!;
      const { signals } = await extract(ex.text);
      const quotes: RunCase["quotes"] = {};
      for (const s of signals) {
        quotes[s.signal] = { quote: s.quote, confidence: s.confidence, grounded: quoteIsGrounded(s.quote, ex.text) };
      }
      cases.push({
        id: ex.id,
        truth: ex.labels,
        predicted: signals.map((s) => s.signal),
        difficulty: ex.difficulty,
        quotes,
        text: ex.text,
      });
      process.stderr.write(".");
    }
  }),
);
process.stderr.write("\n");

const n = cases.length;
const counts = tally(cases);
const report: Record<string, unknown> = { model: MODEL, conversations: n, source: "CONSTRUCTED TEST EXAMPLES" };

const perSignal: Record<string, unknown> = {};
for (const s of SIGNAL_TYPES) perSignal[s] = metricsFor(counts[s], n);
report["perSignal"] = perSignal;

const direct = metricsFor(combine(DIRECT_SIGNALS.map((s) => counts[s])), n);
const circ = metricsFor(combine(CIRCUMSTANTIAL_SIGNALS.map((s) => counts[s])), n);
report["direct"] = { ...direct, pass: passesGate(direct, GATE.direct), gate: GATE.direct };
report["circumstantial"] = { ...circ, pass: passesGate(circ, GATE.circumstantial), gate: GATE.circumstantial };

const cleanCases = cases.filter((c) => c.truth.length === 0);
report["cleanConversations"] = cleanCases.length;
report["cleanFlagged"] = cleanCases.filter((c) => c.predicted.length > 0).map((c) => ({ id: c.id, predicted: c.predicted, quotes: c.quotes }));

const ungrounded = cases.flatMap((c) =>
  Object.entries(c.quotes).filter(([, q]) => !q.grounded).map(([sig, q]) => ({ id: c.id, signal: sig, quote: q.quote })),
);
report["ungroundedQuotes"] = ungrounded;

report["errors"] = cases
  .filter((c) => {
    const missed = c.truth.filter((t) => !c.predicted.includes(t));
    const spurious = c.predicted.filter((p) => !c.truth.includes(p));
    return missed.length > 0 || spurious.length > 0;
  })
  .map((c) => ({
    id: c.id,
    difficulty: c.difficulty,
    truth: c.truth,
    predicted: c.predicted,
    missed: c.truth.filter((t) => !c.predicted.includes(t)),
    spurious: c.predicted.filter((p) => !c.truth.includes(p)),
    quotes: c.quotes,
    text: c.text,
  }));

await Bun.write("/tmp/phase0-report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, errors: undefined, cleanFlagged: undefined }, null, 2));
