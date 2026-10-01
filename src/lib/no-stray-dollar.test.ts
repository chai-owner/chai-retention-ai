// Guard: customer-data money must go through the account-aware formatter
// (src/lib/money.ts). A hard-coded "$" or a USD-only Intl formatter outside the
// allowed billing / demo / formatter files fails this test.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..");

/** Files allowed to contain "$" / "USD", with the reason. */
export const ALLOWED: Record<string, string> = {
  "lib/money.ts": "the formatter itself",
  "lib/currency-rules.ts": "maps $ / US$ to USD when reading uploads",
  "lib/mock-data.ts": "homepage/demo sample data, and the saved '$' measure prefix mapped to the account symbol",
  "components/landing/hero-risk-card.tsx": "homepage demo, pinned to USD",
  "components/landing/dashboard-mockup.tsx": "homepage demo illustration",
  "routes/pricing.tsx": "ChAi subscription prices (Paddle, USD)",
  "routes/terms.tsx": "ChAi subscription prices in the terms",
  "routes/founder.tsx": "ChAi Founder plan price",
  "lib/promo-codes.ts": "ChAi subscription discounts",
  "lib/organisations.ts": "ChAi plan prices",
  "components/admin-billing.tsx": "ChAi subscription revenue (admin)",
  "routes/_authenticated.admin.tsx": "ChAi subscription revenue (admin)",
  "components/change-plan-dialog.tsx": "ChAi plan prices",
  "components/plan-limits.tsx": "ChAi plan prices",
  "components/trial-status.tsx": "ChAi plan prices",
  "components/data-uploads-panel.tsx": "Data Drop add-on price",
  "lib/paddle.server.ts": "Paddle billing",
  "routes/api/public/payments/webhook.ts": "Paddle billing",
  "lib/content-signals/budget.ts": "ChAi's own AI spend budget",
  "components/data-currency-card.tsx": "explains $12,500 vs R 12,500 when switching",
  "routes/_authenticated.app.settings.tsx": "placeholder that follows the chosen symbol",
  "routes/_authenticated.onboarding.tsx": "segment labels that follow the chosen symbol",
  "routes/_authenticated.app.planner.tsx": "maps the saved '$' prefix to dollars / rand",
  "lib/ingest.functions.ts": "AI instruction naming $ and US$ as USD",
};

const PATTERNS: Array<[RegExp, string]> = [
  [/currency:\s*["']USD["']/, "USD-only Intl formatter"],
  [/\$\$\{/, "raw $ before an amount"],
  [/\$\d{2,}|\$\d+[.,]\d|\$\d+k\b/, "hard-coded dollar amount"],
  [/>\s*\$\s*[{<]/, "$ written in page text"],
  [/["'`]\$["'`]/, "a bare \"$\" string"],
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "test" || name === "integrations") continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && name !== "routeTree.gen.ts") {
      out.push(p);
    }
  }
  return out;
}

describe("no stray $ outside billing and demo files", () => {
  it("finds none", () => {
    const hits: string[] = [];
    for (const file of walk(ROOT)) {
      const rel = relative(ROOT, file).replace(/\\/g, "/");
      if (ALLOWED[rel]) continue;
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/^\s*(\/\/|\*)/.test(line)) return;
          for (const [re, why] of PATTERNS) if (re.test(line)) hits.push(`${rel}:${i + 1} ${why}: ${line.trim().slice(0, 120)}`);
        });
    }
    expect(hits).toEqual([]);
  });

  it("would catch a USD formatter", () => {
    expect(PATTERNS.some(([re]) => re.test(`new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })`))).toBe(true);
    expect(PATTERNS.some(([re]) => re.test("`$${revenue}`"))).toBe(true);
  });
});
