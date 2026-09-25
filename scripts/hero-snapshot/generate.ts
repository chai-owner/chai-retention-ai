// Generates the homepage hero snapshot by running a seeded demo account
// through ChAi's REAL in-app scoring engine (buildRealDataset) with the real
// default metric weights. Nothing in the output is hand-edited: the JSON this
// writes is exactly what the engine returned for the chosen customer.
//
//   bun scripts/hero-snapshot/generate.ts
//
// Re-run to refresh the snapshot; the capture timestamp is stored with it.
import { writeFileSync } from "node:fs";
import { buildRealDataset } from "../../src/lib/real-scoring";
import { DEFAULT_METRIC_WEIGHTS } from "../../src/lib/mock-data";
import type { IngestRow } from "../../src/lib/ingested-data-store";

const NOW = Date.now();
const DAY = 86400000;
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString().slice(0, 10);

// Seeded demo account: eight fictional B2B customers with a year of invoices,
// support tickets and product usage. Deterministic, no randomness.
const accounts = [
  { id: "ACC-101", name: "Harbour & Finch Accounting", monthly: 1200, lastInvoice: 12, invoices: [1200, 1200, 1200, 1200, 1200, 1200], tickets: [["closed", 9], ["closed", 8]], logins: [42, 40, 45], features: [9, 9, 10] },
  { id: "ACC-102", name: "Ridgeway Physio Group", monthly: 850, lastInvoice: 20, invoices: [850, 850, 850, 850, 850, 850], tickets: [["closed", 8]], logins: [30, 28, 31], features: [7, 8, 7] },
  { id: "ACC-103", name: "Oakline Studio", monthly: 640, lastInvoice: 25, invoices: [640, 640, 640, 640, 640], tickets: [["closed", 7], ["closed", 9]], logins: [22, 25, 21], features: [6, 6, 7] },
  { id: "ACC-104", name: "Brightside Dental", monthly: 980, lastInvoice: 8, invoices: [980, 980, 980, 980, 980, 980], tickets: [], logins: [36, 38, 35], features: [8, 8, 9] },
  { id: "ACC-105", name: "Meadowbank Logistics", monthly: 2100, lastInvoice: 118, invoices: [2100, 1900, 1400, 900], tickets: [["open", 3], ["reopened", 4], ["open", 5], ["closed", 6]], logins: [9, 6, 4], features: [3, 2, 2] },
  { id: "ACC-106", name: "Tidewater Legal", monthly: 1500, lastInvoice: 45, invoices: [1500, 1500, 1500, 1500, 1500], tickets: [["closed", 7], ["open", 6]], logins: [24, 20, 18], features: [6, 5, 5] },
  { id: "ACC-107", name: "Copperfield Veterinary", monthly: 720, lastInvoice: 30, invoices: [720, 720, 720, 720, 720], tickets: [["closed", 8]], logins: [19, 21, 20], features: [5, 6, 5] },
  { id: "ACC-108", name: "Northgate Property Co.", monthly: 1750, lastInvoice: 16, invoices: [1750, 1750, 1750, 1750, 1750, 1750], tickets: [["closed", 9]], logins: [33, 35, 34], features: [8, 9, 8] },
] as const;

const customers: IngestRow[] = [];
const transactions: IngestRow[] = [];
const support: IngestRow[] = [];
const usage: IngestRow[] = [];

for (const a of accounts) {
  customers.push({ customer_id: a.id, name: a.name, monthly_revenue: String(a.monthly), signup_date: iso(540) } as IngestRow);
  a.invoices.forEach((amt, i) => {
    transactions.push({ transaction_id: `${a.id}-INV-${i}`, customer_id: a.id, amount: String(amt), transaction_date: iso(a.lastInvoice + (a.invoices.length - 1 - i) * 30) } as IngestRow);
  });
  a.tickets.forEach(([status, csat], i) => {
    support.push({ ticket_id: `${a.id}-T-${i}`, customer_id: a.id, status, satisfaction_score: String(csat) } as IngestRow);
  });
  a.logins.forEach((l, i) => {
    usage.push({ customer_id: a.id, logins: String(l), features_used: String(a.features[i]) } as IngestRow);
  });
}

const dataset = buildRealDataset({ customers, transactions, support, usage }, { ...DEFAULT_METRIC_WEIGHTS }, null);
const ranked = [...dataset.customers].sort((x, y) => x.health - y.health);
const chosen = ranked.find((c) => c.recommendations.length >= 2) ?? ranked[0];

const snapshot = {
  capturedAt: new Date(NOW).toISOString(),
  engine: "buildRealDataset (src/lib/real-scoring.ts) with DEFAULT_METRIC_WEIGHTS",
  seed: "scripts/hero-snapshot/generate.ts — 8 fictional demo accounts",
  customer: chosen,
};
writeFileSync("src/lib/hero-snapshot.json", JSON.stringify(snapshot, null, 2) + "\n");
console.log(ranked.map((c) => `${c.name}: ${c.health}`).join("\n"));
console.log("\nCHOSEN:", JSON.stringify({ name: chosen.name, health: chosen.health, churnProbability: chosen.churnProbability, churnConfidence: chosen.churnConfidence, factors: chosen.factors, recs: chosen.recommendations.map((r) => [r.title, r.revenueSaved]) }, null, 2));
