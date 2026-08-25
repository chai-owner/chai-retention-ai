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
import { useScoredData } from "@/lib/use-scored-data";
import { useSignedIn } from "@/lib/use-auth-state";
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

function difficultyFor(score: number): "Easy" | "Moderate" | "Hard" {
  if (score >= 70) return "Easy";
  if (score >= 45) return "Moderate";
  return "Hard";
}

// Win-back play tailored to the reason the user recorded when marking churn.
const reasonPlaybook: Record<string, string> = {
  "Price / value": "Lead with proof of value, then offer a right-sized plan or a time-boxed discount to re-open the conversation.",
  "Stopped using the product": "Re-onboard them: a short guided session on the one workflow that delivered value, plus a reminder of what's new.",
  "Poor support experience": "Have a senior owner apologise directly, share what changed in support, and offer a dedicated contact on return.",
  "Missing features": "Show them the roadmap items that closed their gap and invite them to test it before committing.",
  "Switched to a competitor": "Position the differences they'll be missing and offer a low-risk parallel trial alongside their new tool.",
  "Budget cut / business closed": "Keep it warm — a light, no-pressure check-in when their next budget cycle opens.",
  "Onboarding never landed": "Restart with a hands-on setup, done for them, and a clear 30-day success milestone.",
  Other: "Call them to hear the real story, then follow up with a written win-back offer addressing it.",
};

function winBackActionFor(c: Customer, reason?: string): string {
  if (reason && reasonPlaybook[reason]) return reasonPlaybook[reason];
  return (
    c.recommendations[0]?.title ??
    `Reach out with a tailored win-back offer addressing ${
      (reason ?? c.factors[0]?.label ?? "their main concern").toLowerCase()
    }.`
  );
}

// Turn a real (signed-in) customer that the user manually marked churned /
// won-back into the same shape the win-back view renders.
function toLifecycleCustomer(c: Customer, o: { reason?: string; date: string }): Customer {
  const winBackScore = Math.max(5, Math.min(95, Math.round(c.health * 0.6 + c.sentiment * 0.4)));
  return {
    ...c,
    status: "churned",
    churnedDate: o.date,
    winBackScore,
    winBackDifficulty: difficultyFor(winBackScore),
    winBackAction: winBackActionFor(c, o.reason),
  };
}

function Churned() {
  const overrides = useChurnOverrides();
  const signedIn = useSignedIn();
  const { sortedByRisk } = useScoredData();
  // Signed-in users only ever see their own real data — never the sample set.
  const isReal = signedIn === true;

  const churned = useMemo(() => {
    if (!isReal) return getChurnedCustomers();
    return sortedByRisk
      .filter((c) => overrides[c.id]?.status === "churned")
      .map((c) => toLifecycleCustomer(c, overrides[c.id]!));
  }, [isReal, sortedByRisk, overrides]);

  const wonBack = useMemo(() => {
    if (!isReal) return getWonBackCustomers();
    return sortedByRisk
      .filter((c) => overrides[c.id]?.status === "won-back")
      .map((c) => ({ ...c, status: "won-back" as const }));
  }, [isReal, sortedByRisk, overrides]);

  const stats = useMemo(() => {
    if (!isReal) return churnAnalytics(activeCustomers.length);
    const activeCount = sortedByRisk.filter((c) => !overrides[c.id]).length;
    const revenueLost = churned.reduce((s, c) => s + c.revenue, 0);
    const winBackOpportunity = churned.reduce(
      (s, c) => s + Math.round(c.revenue * ((c.winBackScore ?? 0) / 100)),
      0,
    );
    const total = activeCount + churned.length;
    const counts = new Map<string, number>();
    churned.forEach((c) => {
      const label = overrides[c.id]?.reason ?? c.factors[0]?.label ?? "Other";
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    const topReasons = [...counts.entries()]
      .map(([label, count]) => ({
        label,
        count,
        share: churned.length ? Math.round((count / churned.length) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);
    const tenures = churned.map((c) => c.tenureMonths ?? 0).filter((t) => t > 0);
    return {
      churnRate: total ? Math.round((churned.length / total) * 100) : 0,
      revenueLost,
      winBackOpportunity,
      avgTenureMonths: tenures.length
        ? Math.round(tenures.reduce((s, t) => s + t, 0) / tenures.length)
        : 0,
      topReasons,
    };
  }, [isReal, churned, sortedByRisk, overrides]);

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
