import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, ArrowDownRight, Minus, Sparkles, MessageSquareWarning, ChevronDown } from "lucide-react";
import { PageHeader, Card } from "@/components/ui/chai";
import { benchmarks, formatCurrency, type Customer } from "@/lib/mock-data";
import { useScoredData } from "@/lib/use-scored-data";
import { useSignedIn } from "@/lib/use-auth-state";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/insights")({
  head: () => ({ meta: [{ title: "Insights & Benchmarks — ChAi" }] }),
  component: Insights,
});

type RecCustomer = { id: string; name: string; segment: string; health: number; saved: number };

// Aggregate the top recommendations across all at-risk customers.
function aggregateRecs(customers: Customer[]) {
  const map = new Map<string, { title: string; count: number; saved: number; priority: string; customers: RecCustomer[] }>();
  customers
    .filter((c) => c.health < 60)
    .forEach((c) =>
      c.recommendations.forEach((r) => {
        const cur = map.get(r.title) ?? { title: r.title, count: 0, saved: 0, priority: r.priority, customers: [] };
        cur.count += 1;
        cur.saved += r.revenueSaved;
        cur.customers.push({ id: c.id, name: c.name, segment: c.segment, health: c.health, saved: r.revenueSaved });
        map.set(r.title, cur);
      }),
    );
  return [...map.values()]
    .map((r) => ({ ...r, customers: r.customers.sort((a, b) => b.saved - a.saved) }))
    .sort((a, b) => b.saved - a.saved);
}

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
  const { customers } = useScoredData();
  const signedIn = useSignedIn();
  const isReal = signedIn === true;
  const [expanded, setExpanded] = useState<string | null>(null);
  const recAgg = useMemo(() => aggregateRecs(customers), [customers]);
  return (

    <div>
      <PageHeader
        title="Insights & Benchmarks"
        description="ChAi turns your data into prioritized actions and shows how you compare to similar businesses."
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
          {recAgg.map((r, i) => {
            const isOpen = expanded === r.title;
            return (
              <div key={r.title} className="rounded-lg border border-border">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : r.title)}
                  className="flex w-full items-center gap-4 p-4 text-left"
                >
                  <span className="font-display text-2xl italic text-muted-foreground">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{r.title}</p>
                    <p className="text-xs text-muted-foreground">Applies to {r.count} customers · {r.priority} priority</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-success">{formatCurrency(r.saved)}</p>
                    <p className="text-[11px] text-muted-foreground">est. saved</p>
                  </div>
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                </button>
                {isOpen && (
                  <div className="border-t border-border p-4 pt-3">
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Customers this applies to
                    </p>
                    <div className="space-y-1.5">
                      {r.customers.map((c) => (
                        <Link
                          key={c.id}
                          to="/app/customers/$id"
                          params={{ id: c.id }}
                          className="flex items-center justify-between rounded-md bg-secondary/50 px-3 py-2 hover:bg-secondary"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{c.name}</p>
                            <p className="text-[11px] text-muted-foreground">{c.segment} · health {c.health}</p>
                          </div>
                          <span className="ml-3 shrink-0 text-xs font-semibold text-success">{formatCurrency(c.saved)}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {!isReal && (
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
              Phrases ChAi detected in support conversations that signal churn risk.
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
      )}
      {isReal && recAgg.length === 0 && (
        <Card className="mt-6">
          <p className="text-sm text-muted-foreground">
            Benchmarks and sentiment intelligence will appear here once you've connected enough of your own data.
          </p>
        </Card>
      )}
    </div>
  );
}
