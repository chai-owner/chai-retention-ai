import { describe, it, expect } from "vitest";
import { assessCoverage, coverageBasis } from "@/lib/data-coverage";
import { makeIngested, daysAgo } from "@/test/fixtures";

describe("assessCoverage", () => {
  it("flags low confidence when nothing has been added", () => {
    const c = assessCoverage({});
    expect(c.confidence).toBe("low");
    expect(c.flagged).toBe(true);
    expect(c.missing.length).toBe(c.datasets.length);
  });

  it("marks a dataset missing when it has no rows", () => {
    const c = assessCoverage({ customers: [{ customer_id: "A" }] });
    expect(c.datasets.find((d) => d.key === "usage")?.status).toBe("missing");
  });

  it("marks a dataset stale when its newest row is older than 30 days", () => {
    const c = assessCoverage({
      customers: [{ customer_id: "A" }],
      transactions: [{ customer_id: "A", transaction_date: daysAgo(90), amount: "10" }],
    });
    const tx = c.datasets.find((d) => d.key === "transactions")!;
    expect(tx.status).toBe("stale");
    expect(tx.daysSince).toBeGreaterThan(30);
    expect(c.notes.some((n) => /out of date|days old/i.test(n))).toBe(true);
  });

  it("treats recent rows as ok", () => {
    const c = assessCoverage({
      customers: [{ customer_id: "A" }],
      transactions: [{ customer_id: "A", transaction_date: daysAgo(2), amount: "10" }],
    });
    expect(c.datasets.find((d) => d.key === "transactions")?.status).toBe("ok");
  });

  it("recognizes canonical survey and support date fields", () => {
    const c = assessCoverage({
      customers: [{ customer_id: "A" }],
      surveys: [{ customer_id: "A", survey_date: daysAgo(2), score: "8" }],
      support: [{ customer_id: "A", created_date: daysAgo(3), ticket_id: "T1" }],
    });
    expect(c.datasets.find((d) => d.key === "surveys")?.status).toBe("ok");
    expect(c.datasets.find((d) => d.key === "support")?.status).toBe("ok");
  });

  it("is partial (not low) when most signals are present", () => {
    const c = assessCoverage(makeIngested());
    expect(["partial", "good"]).toContain(c.confidence);
  });

  it("describes what the assessment is based on", () => {
    const c = assessCoverage(makeIngested());
    expect(coverageBasis(c)).toMatch(/Based on the data available today/);
  });

  it("does not require support unless an active metric depends on support", () => {
    const data = {
      customers: [{ customer_id: "A" }],
      usage: [{ customer_id: "A", date: daysAgo(1), workout_duration_minutes: "45" }],
    };
    const workout = [{
      name: "Average Workout Duration",
      why: "Average workout minutes per visit",
      churn: "Shorter workouts indicate disengagement",
      category: "Engagement",
    }];
    const withoutSupport = assessCoverage(data, workout);
    expect(withoutSupport.datasets.some((dataset) => dataset.key === "support")).toBe(false);
    expect(withoutSupport.datasets.find((dataset) => dataset.label === "Average Workout Duration")?.rows).toBe(1);

    const withSupport = assessCoverage(data, [{
      name: "Open Support Tickets",
      why: "Tracks unresolved support issues",
      churn: "Unresolved tickets cause churn",
      category: "Support",
    }]);
    expect(withSupport.datasets.find((dataset) => dataset.key === "support")?.status).toBe("missing");
  });
});
