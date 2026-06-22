import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList, TrendingUp } from "lucide-react";
import { PageHeader, Card } from "@/components/ui/chai";
import { plannerMetrics, IMPORTANCE_LABELS } from "@/lib/mock-data";
import { useMetricWeights } from "@/lib/use-scored-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/planner")({
  head: () => ({ meta: [{ title: "Intelligence Planner — ChAi" }] }),
  component: Planner,
});

type Status = "tracking" | "upload" | "help" | "na";

const statusOptions: { key: Status; label: string }[] = [
  { key: "tracking", label: "Already tracking" },
  { key: "upload", label: "Can upload" },
  { key: "help", label: "Need help" },
  { key: "na", label: "Not relevant" },
];

const statusStyle: Record<Status, string> = {
  tracking: "bg-success text-success-foreground border-success",
  upload: "bg-warning text-warning-foreground border-warning",
  help: "bg-caution text-caution-foreground border-caution",
  na: "bg-secondary text-secondary-foreground border-border",
};

function Planner() {
  const [selections, setSelections] = useState<Record<string, Status>>({});
  const weights = useMetricWeights();

  const tracked = Object.values(selections).filter((s) => s === "tracking").length;
  const total = plannerMetrics.length;
  const accuracy = Math.min(96, 48 + Math.round((tracked / total) * 48));

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
        <Card>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp className="h-4 w-4" /> You're tracking
          </div>
          <p className="mt-2 text-2xl font-semibold">{tracked} / {total}</p>
        </Card>
        <Card>
          <div className="text-sm text-muted-foreground">Expected prediction accuracy</div>
          <p className="mt-2 text-2xl font-semibold text-primary">{accuracy}%</p>
          <p className="text-xs text-muted-foreground">Improves as you track more.</p>
        </Card>
      </div>

      <div className="space-y-4">
        {plannerMetrics.map((m) => {
          const level = weights[m.name] ?? 3;
          const pct = Math.round((level / 5) * 100);
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
                <div className="mt-3 grid gap-3 text-xs sm:grid-cols-3">
                  <div>
                    <p className="font-medium text-foreground">How it predicts churn</p>
                    <p className="mt-0.5 text-muted-foreground">{m.churn}</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Measure</p>
                    <p className="mt-0.5 text-muted-foreground">{m.cadence}</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Healthy benchmark</p>
                    <p className="mt-0.5 text-muted-foreground">{m.benchmark}</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 lg:w-52 lg:shrink-0 lg:justify-end">
                {statusOptions.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setSelections((prev) => ({ ...prev, [m.name]: s.key }))}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                      selections[m.name] === s.key
                        ? statusStyle[s.key]
                        : "border-border bg-card text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
