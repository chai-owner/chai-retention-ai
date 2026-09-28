import { describe, expect, it } from "vitest";
import { metricDirection } from "@/lib/metric-direction";
import { scoreCustomers } from "@/lib/customer-scoring";
import { buildRealDataset } from "@/lib/real-scoring";
import { makeProfile } from "@/test/fixtures";
import type { IngestedData } from "@/lib/ingested-data-store";
import type { PlannerMetric } from "@/lib/mock-data";

// "Fewer is better" measure with no reference values: both screens must agree.
const tickets: PlannerMetric = {
  name: "Unresolved Support Tickets",
  why: "Open tickets waiting on us",
  churn: "Friction builds frustration",
  category: "Support",
};

const customers = ["A", "B", "C", "D", "E"];
const openCounts: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, E: 4 };
const data = {
  customers: customers.map((c) => ({ customer_id: c, name: c })),
  support: customers.flatMap((c) => [
    { ticket_id: `${c}-r`, customer_id: c, status: "solved", created_date: "2026-09-01" },
    ...Array.from({ length: openCounts[c]! }, (_, i) => ({ ticket_id: `${c}-${i}`, customer_id: c, status: "open", created_date: "2026-09-01" })),
  ]),
} as unknown as IngestedData;

describe("shared direction for fewer-is-better measures", () => {
  it("the shared rule says lower is better for an unresolved-tickets measure", () => {
    expect(metricDirection(tickets)).toBe("lower");
  });

  it("the nightly score is lower when the open-ticket count is higher", () => {
    const rows = scoreCustomers([tickets], data);
    const part = (id: string) =>
      (rows.find((r) => r.customer_id === id)!.score_breakdown as Array<{ metric?: string; normalised?: number }>).find((e) => e.metric === tickets.name)!.normalised!;
    expect(part("A")).toBeGreaterThan(part("E"));
  });

  it("the customer page is lower when the open-ticket count is higher", () => {
    const ds = buildRealDataset(data, { [tickets.name]: 3 }, makeProfile({ metrics: [tickets] }));
    const sub = (id: string) => ds.customers.find((c) => c.id === id)!.subScores[tickets.name]!;
    expect(sub("A")).toBeGreaterThan(sub("E"));
  });

  it("both screens agree on direction for the same measure", () => {
    const rows = scoreCustomers([tickets], data);
    const nightly = (id: string) =>
      (rows.find((r) => r.customer_id === id)!.score_breakdown as Array<{ metric?: string; normalised?: number }>).find((e) => e.metric === tickets.name)!.normalised!;
    const ds = buildRealDataset(data, { [tickets.name]: 3 }, makeProfile({ metrics: [tickets] }));
    const page = (id: string) => ds.customers.find((c) => c.id === id)!.subScores[tickets.name]!;
    for (const [x, y] of [["A", "B"], ["B", "D"], ["C", "E"]] as const) {
      expect(Math.sign(nightly(x) - nightly(y))).toBe(Math.sign(page(x) - page(y)));
    }
  });
});
