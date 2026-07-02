import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  UserMinus,
  RotateCcw,
  DollarSign,
  Clock,
  TrendingDown,
  Sparkles,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { PageHeader, StatCard, Card } from "@/components/ui/chai";
import {
  customers as activeCustomers,
  getChurnedCustomers,
  getWonBackCustomers,
  churnAnalytics,
  formatCurrency,
  type Customer,
} from "@/lib/mock-data";
import { useChurnOverrides } from "@/lib/churn-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/churned")({
  head: () => ({
    meta: [
      { title: "Churned & Win-back — ChAi" },
      {
        name: "description",
        content:
          "Review customers who have left, rank the best win-back opportunities, and learn why customers churn.",
      },
    ],
  }),
  component: Churned,
});

const difficultyChip: Record<string, string> = {
  Easy: "bg-success/10 text-success border-success/20",
  Moderate: "bg-warning/15 text-warning-foreground border-warning/30",
  Hard: "bg-danger/10 text-danger border-danger/20",
};

function winBackTone(score: number) {
  return score >= 70 ? "text-success" : score >= 45 ? "text-warning" : "text-danger";
}

function Churned() {
  // Subscribe so manual overrides re-render this view (used for won-back count).
  useChurnOverrides();

  const churned = useMemo(() => getChurnedCustomers(), []);
  const wonBack = useMemo(() => getWonBackCustomers(), []);
  const stats = useMemo(() => churnAnalytics(activeCustomers.length), []);

  const candidates = useMemo(
    () => [...churned].sort((a, b) => (b.winBackScore ?? 0) - (a.winBackScore ?? 0)),
    [churned],
  );

  return (
    <div>
      <PageHeader
        title="Churned & Win-back"
        description="Customers who have already left are kept out of your active metrics — here they become win-back opportunities and lessons on why customers leave."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Churn rate" value={`${stats.churnRate}%`} icon={TrendingDown} tone="danger" hint="Of your total book" />
        <StatCard
          label="Revenue lost"
          value={
            <span>
              {formatCurrency(stats.revenueLost)} <span className="text-sm font-normal italic text-muted-foreground">/ yr</span>
            </span>
          }
          icon={DollarSign}
          tone="danger"
        />
        <StatCard
          label="Win-back opportunity"
          value={
            <span>
              {formatCurrency(stats.winBackOpportunity)} <span className="text-sm font-normal italic text-muted-foreground">/ yr</span>
            </span>
          }
          icon={RotateCcw}
          tone="success"
          hint="Weighted by re-win likelihood"
        />
        <StatCard label="Avg. tenure before churn" value={`${stats.avgTenureMonths} mo`} icon={Clock} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Win-back candidates */}
        <div className="lg:col-span-2">
          <Card>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-primary">
                <Sparkles className="h-4 w-4" />
              </span>
              <h3 className="font-semibold">Win-back candidates</h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Churned accounts ranked by how likely ChAi thinks they are to return, with the best move for each.
            </p>
            <div className="mt-4 space-y-3">
              {candidates.map((c) => (
                <div key={c.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <Link
                        to="/app/customers/$id"
                        params={{ id: c.id }}
                        className="text-sm font-medium hover:text-primary"
                      >
                        {c.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {c.segment} · left {c.churnedDate} · {formatCurrency(c.revenue)}/yr
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn("text-sm font-semibold tabular-nums", winBackTone(c.winBackScore ?? 0))}>
                        {c.winBackScore}% win-back
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                          difficultyChip[c.winBackDifficulty ?? "Moderate"],
                        )}
                      >
                        {c.winBackDifficulty}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 flex items-start gap-2 rounded-md bg-accent/50 p-2.5 text-xs text-accent-foreground">
                    <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{c.winBackAction}</span>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Left because: <span className="font-medium text-foreground">{c.factors[0]?.label}</span> ·
                    Est. recoverable{" "}
                    <span className="font-medium text-success">
                      {formatCurrency(Math.round(c.revenue * ((c.winBackScore ?? 0) / 100)))}
                    </span>
                  </p>
                </div>
              ))}
              {candidates.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">No churned customers — great retention!</p>
              )}
            </div>
          </Card>
        </div>

        {/* Why customers leave */}
        <div className="space-y-6">
          <Card>
            <h3 className="font-semibold">Why customers leave</h3>
            <p className="mt-1 text-xs text-muted-foreground">The top reasons behind churn — learn the patterns to prevent the next one.</p>
            <div className="mt-4 space-y-3">
              {stats.topReasons.map((r) => (
                <div key={r.label}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{r.label}</span>
                    <span className="text-xs text-muted-foreground">{r.share}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-danger" style={{ width: `${r.share}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {wonBack.length > 0 && (
            <Card>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <h3 className="font-semibold">Recently won back</h3>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Accounts you re-engaged after they churned.</p>
              <ul className="mt-3 space-y-2">
                {wonBack.map((c: Customer) => (
                  <li key={c.id} className="flex items-center justify-between text-sm">
                    <Link to="/app/customers/$id" params={{ id: c.id }} className="hover:text-primary">
                      {c.name}
                    </Link>
                    <span className="text-xs font-medium text-success">{formatCurrency(c.revenue)}/yr</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
