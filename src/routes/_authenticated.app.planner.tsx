import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";
import { PageHeader, Card } from "@/components/ui/chai";
import { IMPORTANCE_LABELS, metricActualValue } from "@/lib/mock-data";
import { useActiveMetrics, useMetricWeights, useScoredData } from "@/lib/use-scored-data";
import { useSignedIn } from "@/lib/use-auth-state";
import { useProfile } from "@/lib/profile-store";

export const Route = createFileRoute("/_authenticated/app/planner")({
  head: () => ({ meta: [{ title: "Intelligence Planner — ChAi" }] }),
  component: Planner,
});

// Human-readable label for what a metric's number actually represents. Uses
// the metric's own unit when it has one, otherwise infers a sensible noun from
// the metric name so AI-generated metrics still explain themselves.
function unitLabel(m: { name: string; unit?: string; prefix?: string }): string {
  const u = (m.unit ?? "").trim().replace(/^\/\s*/, "per ");
  if (u) {
    if (u === "%") return "percent";
    if (u.startsWith("/")) return u;
    return u;
  }
  if (m.prefix === "$") return "dollars";
  const n = m.name.toLowerCase();
  if (/(minute|duration)/.test(n)) return "minutes";
  if (/hour/.test(n)) return "hours";
  if (/\bdays?\b|tenure|recency/.test(n)) return "days";
  if (/week/.test(n)) return "times per week";
  if (/month/.test(n)) return "times per month";
  if (/visit|check-?in|attendance|session/.test(n)) return "visits";
  if (/(rate|%|percent|utilization|delinquen|adoption|churn)/.test(n)) return "percent";
  if (/(revenue|spend|value|dues|price|fee)/.test(n)) return "dollars";
  if (/(count|volume|number|tickets)/.test(n)) return "count";
  if (/(score|nps|csat|satisfaction)/.test(n)) return "score";
  return "value";
}

function Planner() {

  const weights = useMetricWeights();
  const signedIn = useSignedIn();
  const profile = useProfile();
  const activeMetrics = useActiveMetrics();
  // Signed-in users only ever see metrics generated for their own business.
  // The built-in sample metric set is demo-only — never fall back to it.
  const plannerMetrics =
    signedIn === true ? (profile?.metrics ?? []) : activeMetrics;
  const { customers } = useScoredData();

  const total = plannerMetrics.length;

  // Average sub-score per metric, broken down by customer segment.
  const segmentAverages = useMemo(() => {
    const segments = Array.from(new Set(customers.map((c) => c.segment)));
    const byMetric: Record<string, { segment: string; avg: number; raw: boolean }[]> = {};
    for (const m of plannerMetrics) {
      byMetric[m.name] = segments.map((seg) => {
        const inSeg = customers.filter((c) => c.segment === seg);
        const values = inSeg
          .map((c) => c.metricValues?.[m.name])
          .filter((value): value is number => value != null);
        const scores = inSeg
          .map((c) => c.subScores?.[m.name])
          .filter((value): value is number => value != null);
        const source = values.length > 0 ? values : scores;
        const sum = source.reduce((total, value) => total + value, 0);
        return { segment: seg, avg: source.length ? sum / source.length : 0, raw: values.length > 0 };
      });
    }
    return byMetric;
  }, [customers, plannerMetrics]);

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

      {plannerMetrics.length === 0 && (
        <Card>
          <p className="text-sm text-muted-foreground">
            No metrics yet. Complete your business profile in onboarding and ChAi will
            generate the metrics that matter for your industry.
          </p>
        </Card>
      )}

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
                <div className="mt-3 text-xs">
                  <p className="font-medium text-foreground">How it predicts churn</p>
                  <p className="mt-0.5 text-muted-foreground">{m.churn}</p>
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
                        className={`flex flex-1 flex-col items-center justify-center rounded-lg border px-2 py-3 text-center ${bgClass}`}
                      >
                        <div className="flex min-h-[2rem] w-full items-center justify-center">
                          <span className="text-center text-[10px] font-medium leading-tight text-muted-foreground">
                            {a.segment}
                          </span>
                        </div>
                        <span className={`my-1 w-full text-center text-lg font-bold tabular-nums ${textClass}`}>
                          {a.raw && m.valueAt0 == null && m.valueAt100 == null
                            ? a.avg.toFixed(m.decimals ?? (Number.isInteger(a.avg) ? 0 : 1))
                            : metricActualValue(m, a.avg)}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {m.benchmark && (
                  <p className="mt-2 text-center text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">Healthy benchmark:</span> {m.benchmark}
                  </p>
                )}

              </div>
            </div>
          </Card>
          );
        })}
      </div>
    </div>
  );
}
