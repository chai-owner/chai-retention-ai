import { describe, expect, it } from "vitest";
import {
  buildDailyBrief,
  buildHeadline,
  topDragEntry,
  SIGNIFICANT_DELTA,
  type SnapshotRow,
} from "@/lib/daily-brief";

const row = (
  id: string,
  score: number,
  risk: SnapshotRow["risk_level"],
  breakdown: Array<{ metric: string; value: number; normalised: number; weight: number }> = [],
): SnapshotRow => ({
  customer_id: id,
  score,
  risk_level: risk,
  scored_at: "2026-08-31T06:00:00.000Z",
  score_breakdown: breakdown.map((b) => ({ ...b, basis: "cohort" as const, baseline: null })),
});

describe("buildDailyBrief", () => {
  it("counts at-risk and critical customers", () => {
    const brief = buildDailyBrief({
      latest: [row("a", 90, "healthy"), row("b", 55, "at-risk"), row("c", 20, "critical")],
    });
    expect(brief.atRiskCount).toBe(1);
    expect(brief.criticalCount).toBe(1);
    expect(brief.needsAttention).toBe(2);
    expect(brief.totalScored).toBe(3);
  });

  it("counts significant movement against the previous snapshot", () => {
    const brief = buildDailyBrief({
      latest: [row("a", 50, "at-risk"), row("b", 80, "healthy"), row("c", 60, "at-risk")],
      previous: [
        { ...row("a", 70, "healthy"), scored_at: "2026-08-30T06:00:00.000Z" },
        { ...row("b", 60, "at-risk"), scored_at: "2026-08-30T06:00:00.000Z" },
        { ...row("c", 61, "at-risk"), scored_at: "2026-08-30T06:00:00.000Z" },
      ],
    });
    expect(brief.declinedCount).toBe(1);
    expect(brief.improvedCount).toBe(1);
    expect(brief.movedCount).toBe(2);
    const a = brief.actions.find((x) => x.customerId === "a");
    expect(a?.delta).toBe(-20);
  });

  it("counts customers that dropped into critical", () => {
    const brief = buildDailyBrief({
      latest: [row("a", 20, "critical"), row("b", 10, "critical")],
      previous: [
        { ...row("a", 65, "at-risk"), scored_at: "2026-08-30T06:00:00.000Z" },
        { ...row("b", 12, "critical"), scored_at: "2026-08-30T06:00:00.000Z" },
      ],
    });
    expect(brief.droppedIntoCritical).toBe(1);
    expect(brief.headline).toContain("critical");
  });

  it("returns at most five prioritised actions, worst score first", () => {
    const latest = Array.from({ length: 8 }, (_, i) => row(`c${i}`, 10 + i, "critical"));
    const brief = buildDailyBrief({ latest });
    expect(brief.actions).toHaveLength(5);
    expect(brief.actions[0]!.customerId).toBe("c0");
    expect(brief.actions.every((a) => a.action.length > 0)).toBe(true);
  });

  it("excludes healthy customers from the action list", () => {
    const brief = buildDailyBrief({ latest: [row("a", 95, "healthy")] });
    expect(brief.actions).toHaveLength(0);
  });

  it("uses names when supplied and falls back to the id", () => {
    const brief = buildDailyBrief({
      latest: [row("a", 30, "critical"), row("b", 35, "critical")],
      names: { a: "Brightpath Motors" },
    });
    expect(brief.actions[0]!.name).toBe("Brightpath Motors");
    expect(brief.actions[1]!.name).toBe("b");
  });

  it("surfaces the heaviest drag metric for each customer", () => {
    const brief = buildDailyBrief({
      latest: [
        row("a", 30, "critical", [
          { metric: "Visit Frequency", value: 1, normalised: 20, weight: 5 },
          { metric: "Survey Score", value: 8, normalised: 90, weight: 5 },
        ]),
      ],
    });
    expect(brief.actions[0]!.topMetric).toBe("Visit Frequency");
    expect(brief.actions[0]!.topMetricValue).toBe(1);
  });

  it("treats a delta below the threshold as no movement", () => {
    const brief = buildDailyBrief({
      latest: [row("a", 50, "at-risk")],
      previous: [{ ...row("a", 50 + SIGNIFICANT_DELTA - 1, "at-risk"), scored_at: "2026-08-30T06:00:00.000Z" }],
    });
    expect(brief.movedCount).toBe(0);
  });
});

describe("headlines", () => {
  const base = {
    atRiskCount: 0,
    criticalCount: 0,
    needsAttention: 0,
    movedCount: 0,
    improvedCount: 0,
    declinedCount: 0,
    droppedIntoCritical: 0,
    totalScored: 10,
  };

  it("explains an empty workspace", () => {
    expect(buildHeadline({ ...base, totalScored: 0 })).toContain("No scored customers");
  });

  it("celebrates a quiet day", () => {
    expect(buildHeadline(base)).toContain("All quiet");
  });

  it("leads with attention needed when nothing worsened", () => {
    expect(buildHeadline({ ...base, needsAttention: 2, atRiskCount: 2 })).toContain("need attention");
  });
});

describe("topDragEntry", () => {
  it("returns null when no breakdown is stored", () => {
    expect(topDragEntry(row("a", 40, "at-risk"))).toBeNull();
  });

  it("weighs the shortfall by metric weight", () => {
    const entry = topDragEntry(
      row("a", 40, "at-risk", [
        { metric: "Low weight, big gap", value: 1, normalised: 10, weight: 1 },
        { metric: "High weight, medium gap", value: 2, normalised: 50, weight: 10 },
      ]),
    );
    expect(entry?.metric).toBe("High weight, medium gap");
  });
});
