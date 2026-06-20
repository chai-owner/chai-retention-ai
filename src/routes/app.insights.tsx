import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, ArrowDownRight, Minus, Sparkles, MessageSquareWarning } from "lucide-react";
import { PageHeader, Card } from "@/components/ui/chai";
import { benchmarks, customers, formatCurrency } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/insights")({
  head: () => ({ meta: [{ title: "Insights & Benchmarks — Chai" }] }),
  component: Insights,
});

// Aggregate the top recommendations across all at-risk customers.
const recAgg = (() => {
  const map = new Map<string, { title: string; count: number; saved: number; priority: string }>();
  customers
    .filter((c) => c.health < 60)
    .forEach((c) =>
      c.recommendations.forEach((r) => {
        const cur = map.get(r.title) ?? { title: r.title, count: 0, saved: 0, priority: r.priority };
        cur.count += 1;
        cur.saved += r.revenueSaved;
        map.set(r.title, cur);
      }),
    );
  return [...map.values()].sort((a, b) => b.saved - a.saved);
})();

const sentimentSignals = [
  { phrase: "Too expensive", type: "Pricing complaint", count: 7 },
  { phrase: "Not seeing value", type: "Value concern", count: 6 },
  { phrase: "Considering alternatives", type: "Competitor mention", count: 4 },
  { phrase: "Thinking about cancelling", type: "Cancellation indicator", count: 3 },
  { phrase: "Still waiting on support", type: "Frustration", count: 9 },
];

const statusIcon = {
  above: { Icon: ArrowUpRight, cls: "text-success" },
  below: { Icon: ArrowDownRight, cls: "text-danger" },
  at: { Icon: Minus, cls: "text-muted-foreground" },
};

function Insights() {
  return (
    <div>
      <PageHeader
        title="Insights & Benchmarks"
        description="Chai turns your data into prioritized actions and shows how you compare to similar businesses."
      />

      {/* Recommendations */}
      <Card>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <h3 className="font-semibold">Top retention recommendations</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Ranked by total revenue you could save across your at-risk accounts.</p>
        <div className="mt-4 space-y-3">
          {recAgg.map((r, i) => (
            <div key={r.title} className="flex items-center gap-4 rounded-lg border border-border p-4">
              <span className="font-display text-2xl italic text-muted-foreground">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{r.title}</p>
                <p className="text-xs text-muted-foreground">Applies to {r.count} customers · {r.priority} priority</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-success">{formatCurrency(r.saved)}</p>
                <p className="text-[11px] text-muted-foreground">est. saved</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Benchmarks */}
        <Card>
          <h3 className="font-semibold">Industry benchmarks</h3>
          <p className="mt-1 text-xs text-muted-foreground">How you compare to similar businesses.</p>
          <div className="mt-4 space-y-3">
            {benchmarks.map((b) => {
              const { Icon, cls } = statusIcon[b.status];
              return (
                <div key={b.metric} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{b.metric}</p>
                    <span className={cn("inline-flex items-center gap-1 text-sm font-semibold", cls)}>
                      <Icon className="h-4 w-4" />
                      {b.you}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">{b.note}</p>
                    <span className="ml-3 shrink-0 text-xs text-muted-foreground">vs {b.benchmark}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Sentiment intelligence */}
        <Card>
          <div className="flex items-center gap-2">
            <MessageSquareWarning className="h-4 w-4 text-caution" />
            <h3 className="font-semibold">Customer interaction intelligence</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Phrases Chai detected in support conversations that signal churn risk.
          </p>
          <div className="mt-4 space-y-2">
            {sentimentSignals.map((s) => (
              <div key={s.phrase} className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">"{s.phrase}"</p>
                  <p className="text-[11px] text-muted-foreground">{s.type}</p>
                </div>
                <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
                  {s.count} mentions
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-success/10 p-2">
              <p className="text-sm font-semibold text-success">54%</p>
              <p className="text-[11px] text-muted-foreground">Positive</p>
            </div>
            <div className="rounded-lg bg-warning/15 p-2">
              <p className="text-sm font-semibold text-warning-foreground">29%</p>
              <p className="text-[11px] text-muted-foreground">Neutral</p>
            </div>
            <div className="rounded-lg bg-danger/10 p-2">
              <p className="text-sm font-semibold text-danger">17%</p>
              <p className="text-[11px] text-muted-foreground">Negative</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
