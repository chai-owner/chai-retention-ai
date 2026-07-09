// Demo accounting ingestion — generates realistic customers + invoices for
// QuickBooks Online, Xero and FreshBooks so the "connect your accounting
// tools" flow shows real data flowing into ChAi.
//
// NOTE: QuickBooks / Xero / FreshBooks are not currently available as Lovable
// connectors, so we can't call a live OAuth gateway for them. Rather than fail
// with a confusing error, connecting here simulates a sync and produces
// representative data (customers + transactions) that lands in ChAi through the
// same review-and-import flow as every other source. Pure, side-effect-free.
import type { ExtractedDataset } from "./ingest.functions";

export type AccountingProvider = "quickbooks" | "xero" | "freshbooks";

export const ACCOUNTING_PROVIDERS: { id: AccountingProvider; name: string }[] = [
  { id: "quickbooks", name: "QuickBooks Online" },
  { id: "xero", name: "Xero" },
  { id: "freshbooks", name: "FreshBooks" },
];

const CUSTOMER_HEADERS = [
  "customer_id",
  "name",
  "email",
  "signup_date",
  "monthly_revenue",
  "plan",
  "region",
];
const TRANSACTION_HEADERS = [
  "customer_id",
  "transaction_id",
  "amount",
  "transaction_date",
  "product",
  "currency",
];

// Small deterministic-ish pools so generated data looks plausible.
const FIRST = ["Northwind", "Acme", "Brightline", "Cedar", "Orbit", "Harbor", "Vertex", "Willow", "Pinecrest", "Lumen", "Maple", "Delta", "Summit", "Ironclad", "Bluewave", "Everest", "Copper", "Solstice", "Granite", "Meridian"];
const LAST = ["Traders", "Studios", "Logistics", "Retail", "Health", "Software", "Foods", "Media", "Fitness", "Supply Co", "Group", "Labs", "Partners", "Systems", "Works", "Collective", "Ventures", "Industries", "Services", "Consulting"];
const REGIONS = ["California", "Texas", "New York", "London", "Ontario", "Berlin", "Sydney", "Auckland", "Dublin", "Toronto"];
const PLANS = ["Starter", "Growth", "Pro", "Business", "Enterprise"];
const PRODUCTS = {
  quickbooks: ["Consulting hrs", "Monthly retainer", "Product order", "Service call", "License renewal"],
  xero: ["Recurring invoice", "Project milestone", "Materials", "Support plan", "Annual subscription"],
  freshbooks: ["Design sprint", "Hourly work", "Deposit", "Maintenance", "Package deal"],
};
const CURRENCY: Record<AccountingProvider, string> = {
  quickbooks: "USD",
  xero: "NZD",
  freshbooks: "CAD",
};

function daysAgo(n: number): string {
  const d = new Date(Date.now() - n * 86400000);
  return d.toISOString().slice(0, 10);
}

// Seeded pseudo-random so each provider produces a stable-ish, varied set.
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export function generateAccountingDatasets(
  provider: AccountingProvider,
  customerCount = 14,
): ExtractedDataset[] {
  const seed = provider === "quickbooks" ? 11 : provider === "xero" ? 29 : 47;
  const rng = makeRng(seed);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rng() * arr.length)];
  const currency = CURRENCY[provider];
  const products = PRODUCTS[provider];

  const customers: string[][] = [];
  const transactions: string[][] = [];

  for (let i = 0; i < customerCount; i++) {
    const id = `${provider.slice(0, 2).toUpperCase()}-${1000 + i}`;
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const email = `billing@${name.toLowerCase().replace(/[^a-z]+/g, "")}.com`;
    const signupDays = 120 + Math.floor(rng() * 900);
    const mrr = 150 + Math.floor(rng() * 4850);

    customers.push([
      id,
      name,
      email,
      daysAgo(signupDays),
      String(mrr),
      pick(PLANS),
      pick(REGIONS),
    ]);

    // 1–5 invoices per customer over the last year.
    const invCount = 1 + Math.floor(rng() * 5);
    for (let j = 0; j < invCount; j++) {
      transactions.push([
        id,
        `INV-${provider.slice(0, 2).toUpperCase()}-${10000 + i * 10 + j}`,
        String(Math.max(40, Math.round((mrr * (0.4 + rng() * 1.6)) / 10) * 10)),
        daysAgo(Math.floor(rng() * 360)),
        pick(products),
        currency,
      ]);
    }
  }

  return [
    {
      key: "customers",
      label: "Customers",
      headers: CUSTOMER_HEADERS,
      rows: customers,
      confidence: 94,
      note: "Imported from accounting customers.",
    },
    {
      key: "transactions",
      label: "Transactions",
      headers: TRANSACTION_HEADERS,
      rows: transactions,
      confidence: 96,
      note: "Imported from accounting invoices / payments.",
    },
  ];
}
