import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  HeartPulse,
  AlertTriangle,
  DollarSign,
  Smile,
  ShoppingCart,
  Activity,
  LifeBuoy,
  MessageSquare,
  ClipboardCheck,
  UserPlus,
  TrendingUp,
  Sparkles,
  Loader2,
  Brain,
} from "lucide-react";
import { PageHeader, StatCard, Card, HealthBadge } from "@/components/ui/chai";
import {
  getCustomer,
  categoryFromHealth,
  formatCurrency,
  type TimelineEvent,
  type Customer,
} from "@/lib/mock-data";
import { assessCustomerRisk, type RiskAssessment } from "@/lib/ai.functions";
import { useScoredData } from "@/lib/use-scored-data";
import { cn } from "@/lib/utils";


export const Route = createFileRoute("/_authenticated/app/customers/$id")({
  head: () => ({ meta: [{ title: "Customer Detail — ChAi" }] }),
  loader: ({ params }) => {
    const customer = getCustomer(params.id);
    if (!customer) throw notFound();
    return { id: params.id };
  },
  component: CustomerDetail,
  notFoundComponent: () => (
    <div className="py-16 text-center">
      <p className="text-muted-foreground">We couldn't find that customer.</p>
      <Link to="/app/customers" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
        Back to Risk Center
      </Link>
    </div>
  ),
});

const timelineIcons: Record<TimelineEvent["type"], typeof ShoppingCart> = {
  signup: UserPlus,
  purchase: ShoppingCart,
  usage: Activity,
  support: LifeBuoy,
  conversation: MessageSquare,
  survey: ClipboardCheck,
  score: TrendingUp,
};

const priorityChip: Record<string, string> = {
  High: "bg-danger/10 text-danger border-danger/20",
  Medium: "bg-warning/15 text-warning-foreground border-warning/30",
  Low: "bg-secondary text-secondary-foreground border-border",
};

function CustomerDetail() {
  const { id } = Route.useLoaderData() as { id: string };
  const { customers } = useScoredData();
  const c = (customers.find((x) => x.id === id) ?? customers[0]) as Customer;
  const cat = categoryFromHealth(c.health);
  const sentimentLabel = c.sentiment >= 60 ? "Positive" : c.sentiment >= 40 ? "Neutral" : "Negative";

  return (
    <div>
      <Link
        to="/app/customers"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Risk Center
      </Link>

      <PageHeader title={c.name} description={`${c.segment} · ${c.contact} · last active ${c.lastActivity}`}>
        <HealthBadge category={cat} />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Health score" value={c.health} icon={HeartPulse} tone={cat === "healthy" ? "success" : cat === "watch" ? "warning" : cat === "at-risk" ? "caution" : "danger"} />
        <StatCard label="Churn probability" value={`${c.churnProbability}%`} icon={AlertTriangle} tone="danger" />
        <StatCard label="Revenue value" value={formatCurrency(c.revenue)} icon={DollarSign} />
        <StatCard label="Sentiment" value={sentimentLabel} icon={Smile} tone={c.sentiment >= 60 ? "success" : c.sentiment >= 40 ? "warning" : "danger"} hint={`Score ${c.sentiment}/100`} />
      </div>




      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Root cause */}
        <Card>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            <h3 className="font-semibold">Why this customer is at risk</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            ChAi analyzed usage, purchases, support and conversations. Here's what's driving the risk.
          </p>
          <div className="mt-4 space-y-4">
            {c.factors.map((f) => (
              <div key={f.label}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{f.label}</span>
                  <span className="text-xs text-muted-foreground">{f.weight}% of risk</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-danger" style={{ width: `${Math.min(100, f.weight * 2.6)}%` }} />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">{f.detail}</p>
              </div>
            ))}
            {c.factors.length === 0 && (
              <p className="text-sm text-muted-foreground">No significant risk factors — this is a healthy account.</p>
            )}
          </div>
          <div className="mt-4 rounded-lg bg-accent/50 p-3 text-xs text-accent-foreground">
            <span className="font-medium">Confidence:</span> {Math.round(72 + c.risk / 5)}% — based on the volume and quality of data available for this customer.
          </div>
        </Card>

        {/* Recommendations */}
        <Card>
          <h3 className="font-semibold">Recommended actions</h3>
          <p className="mt-1 text-xs text-muted-foreground">Ranked by expected revenue saved.</p>
          <div className="mt-4 space-y-3">
            {c.recommendations.map((r) => (
              <div key={r.title} className="rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{r.title}</p>
                  <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium", priorityChip[r.priority])}>
                    {r.priority}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">{r.reasoning}</p>
                <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                  <span>Difficulty: <span className="font-medium text-foreground">{r.difficulty}</span></span>
                  <span>Impact: <span className="font-medium text-foreground">{r.impact}</span></span>
                  <span>Est. saved: <span className="font-medium text-success">{formatCurrency(r.revenueSaved)}</span></span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Timeline */}
      <Card className="mt-6">
        <h3 className="font-semibold">Customer timeline</h3>
        <p className="mt-1 text-xs text-muted-foreground">The complete story of this relationship, from signup to today.</p>
        <ol className="mt-5 space-y-5">
          {c.timeline.map((e, i) => {
            const Icon = timelineIcons[e.type];
            return (
              <li key={i} className="relative flex gap-4 pl-2">
                {i !== c.timeline.length - 1 && (
                  <span className="absolute left-[18px] top-8 h-[calc(100%-4px)] w-px bg-border" />
                )}
                <span className="z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="pb-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{e.title}</p>
                    <span className="text-xs text-muted-foreground">{e.date}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{e.detail}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}


