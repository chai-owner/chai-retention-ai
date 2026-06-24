import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";
import { PageHeader, Card } from "@/components/ui/chai";
import { plannerMetrics, IMPORTANCE_LABELS, metricActualValue } from "@/lib/mock-data";
import { useMetricWeights, useScoredData } from "@/lib/use-scored-data";

export const Route = createFileRoute("/_authenticated/app/planner")({
  head: () => ({ meta: [{ title: "Intelligence Planner — ChAi" }] }),
  component: Planner,
});

function Planner() {
  const weights = useMetricWeights();
  const { customers } = useScoredData();

  const total = plannerMetrics.length;

  // Average sub-score per metric, broken down by customer segment.
  const segmentAverages = useMemo(() => {
    const segments = Array.from(new Set(customers.map((c) => c.segment)));
    const byMetric: Record<string, { segment: string; avg: number }[]> = {};
    for (const m of plannerMetrics) {
      byMetric[m.name] = segments.map((seg) => {
        const inSeg = customers.filter((c) => c.segment === seg);
        const sum = inSeg.reduce((s, c) => s + (c.subScores?.[m.name] ?? 0), 0);
        return { segment: seg, avg: inSeg.length ? Math.round(sum / inSeg.length) : 0 };
      });
    }
    return byMetric;
  }, [customers]);

  return (
    <div>
      <PageHeader
        title="Customer Intelligence Planner"
        description="ChAi teaches you what to measure. Each metric's weight comes from the importance you set during onboarding — it determines how much that metric moves your customer health score."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ClipboardList className="h-4 w-4" /> Recommended metrics
          </div>
          <p className="mt-2 text-2xl font-semibold">{total}</p>
        </Card>
      </div>

      <div className="space-y-4">
        {plannerMetrics.map((m) => {
          const level = weights[m.name] ?? 3;
          const pct = Math.round((level / 5) * 100);
          const averages = segmentAverages[m.name] ?? [];
          return (
          <Card key={m.name}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="lg:max-w-2xl">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{m.name}</h3>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">{m.category}</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[11px] font-medium text-muted-foreground">Weight</span>
                  <div className="h-1.5 w-32 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    {IMPORTANCE_LABELS[level - 1]}
                  </span>
                </div>

                <p className="mt-1.5 text-sm text-muted-foreground">{m.why}</p>
                <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                  <div>
                    <p className="font-medium text-foreground">How it predicts churn</p>
                    <p className="mt-0.5 text-muted-foreground">{m.churn}</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Healthy benchmark</p>
                    <p className="mt-0.5 text-muted-foreground">{m.benchmark}</p>
                  </div>
                </div>
              </div>
              <div className="lg:w-80 lg:shrink-0">
                <p className="mb-3 text-center text-xs font-bold text-foreground">Segment Average</p>
                <div className="flex items-stretch gap-2">
                  {averages.map((a) => {
                    const b = m.benchmarkScore ?? 60;
                    const tone =
                      a.avg >= b ? "success" : a.avg >= b - 20 ? "caution" : "danger";
                    const bgClass =
                      tone === "success"
                        ? "bg-success/10 border-success/20"
                        : tone === "caution"
                          ? "bg-caution/10 border-caution/20"
                          : "bg-danger/10 border-danger/20";
                    const textClass =
                      a.avg >= b ? "text-success" : a.avg >= b - 20 ? "text-caution" : "text-danger";
                    return (
                      <div
                        key={a.segment}
                        className={`flex flex-1 flex-col items-center rounded-lg border px-2 py-3 ${bgClass}`}
                      >
                        <div className="flex min-h-[2rem] items-center justify-center">
                          <span className="text-center text-[10px] font-medium leading-tight text-muted-foreground">
                            {a.segment}
                          </span>
                        </div>
                        <span className={`my-1 text-lg font-bold tabular-nums ${textClass}`}>{a.avg}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </Card>
          );
        })}
      </div>
    </div>
  );
}
