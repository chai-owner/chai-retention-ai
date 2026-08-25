import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
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
  UserMinus,
  RotateCcw,
} from "lucide-react";
import { PageHeader, StatCard, Card, HealthBadge } from "@/components/ui/chai";
import {
  getCustomer,
  categoryFromHealth,
  formatCurrency,
  looksChurned,
  type TimelineEvent,
  type Customer,
} from "@/lib/mock-data";
import { useScoredData, useActiveMetrics } from "@/lib/use-scored-data";
import { useSignedIn } from "@/lib/use-auth-state";
import { useIngestHydrated } from "@/lib/ingested-data-store";
import { churnStore, useChurnOverrides, type ChurnOverride } from "@/lib/churn-store";
import { ChurnReasonDialog } from "@/components/churn-reason-dialog";
import { useIngested } from "@/lib/ingested-data-store";
import { useCustomerAliases } from "@/lib/customer-aliases";
import { sourceLabel, identityCardTitle } from "@/lib/customer-matching";
import { customerIdentities } from "@/lib/customer-merge";
import { cn } from "@/lib/utils";


export const Route = createFileRoute("/_authenticated/app/customers/$id")({
  head: () => ({ meta: [{ title: "Customer Detail — ChAi" }] }),
  component: CustomerDetail,
  notFoundComponent: () => <CustomerMissing />,
});

function CustomerMissing() {
  return (
    <div className="py-16 text-center">
      <p className="text-muted-foreground">We couldn't find that customer.</p>
      <Link to="/app/customers" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
        Back to Risk Center
      </Link>
    </div>
  );
}

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
  const { id } = Route.useParams();
  const { customers } = useScoredData();
  const signedIn = useSignedIn();
  const hydrated = useIngestHydrated();
  const overrides = useChurnOverrides();
  const metrics = useActiveMetrics();
  const [dismissed, setDismissed] = useState(false);
  const [askChurn, setAskChurn] = useState(false);
  // Resolve strictly from the live dataset. Signed-out (demo) visitors can also
  // reach seeded churned/won-back accounts, which live outside the scored set.
  const found =
    customers.find((x) => x.id === id) ?? (signedIn === false ? getCustomer(id) : undefined);

  if (!found) {
    // Real data loads client-side; don't declare "not found" until it's in.
    if (signedIn !== false && !hydrated) {
      return <p className="py-16 text-center text-sm text-muted-foreground">Loading customer…</p>;
    }
    return <CustomerMissing />;
  }
  const c = found as Customer;
  const cat = categoryFromHealth(c.health);
  const sentimentLabel = c.sentiment >= 60 ? "Positive" : c.sentiment >= 40 ? "Neutral" : "Negative";

  // Effective lifecycle status = seeded status, overridden by any manual action.
  const override: ChurnOverride | undefined = overrides[c.id];
  const status = (override?.status ?? c.status ?? "active") as CustomerStatus;
  const suggestChurn = status === "active" && looksChurned(c);

  // Industry-neutral: name the signals actually driving this customer's score —
  // the risk factors when we have them, otherwise the active metric set.
  const signals = (
    c.factors.length > 0 ? c.factors.map((f) => f.label) : metrics.map((m) => m.name)
  )
    .filter(Boolean)
    .slice(0, 4);
  const analyzedCopy =
    signals.length > 0
      ? `ChAi analyzed ${signals.slice(0, -1).join(", ")}${signals.length > 1 ? " and " : ""}${signals[signals.length - 1]}. Here's what's driving the risk.`
      : "ChAi analyzed the data you've connected. Here's what's driving the risk.";

  return (
    <div>
      <Link
        to={status === "active" ? "/app/customers" : "/app/churned"}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to {status === "active" ? "Risk Center" : "Churned & Win-back"}
      </Link>

      <ChurnReasonDialog
        open={askChurn}
        onOpenChange={setAskChurn}
        customerName={c.name}
        suggestedReason={c.factors[0]?.label}
        onConfirm={(reason, note) => {
          churnStore.markChurned(c.id, reason, note);
          toast.success(`${c.name} marked as churned`, { description: reason });
        }}
      />

      {/* Lifecycle banner */}
      {status === "churned" ? (
        <div className="mb-5 flex flex-col gap-3 rounded-xl border border-danger/20 bg-danger/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <UserMinus className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
            <div>
              <p className="text-sm font-semibold text-foreground">This customer has churned</p>
              <p className="text-xs text-muted-foreground">
                They're excluded from active retention metrics. Focus here on winning them back.
              </p>
              {override?.reason && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Reason: <span className="font-medium text-foreground">{override.reason}</span>
                  {override.note ? <span className="block italic">“{override.note}”</span> : null}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => {
              churnStore.markWonBack(c.id);
              toast.success(`${c.name} marked as won back`);
            }}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-success px-3 py-2 text-sm font-medium text-success-foreground hover:bg-success/90"
          >
            <RotateCcw className="h-4 w-4" /> Mark as won back
          </button>
        </div>
      ) : status === "won-back" ? (
        <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-success/20 bg-success/5 p-4">
          <RotateCcw className="h-5 w-5 shrink-0 text-success" />
          <p className="text-sm font-medium text-foreground">Won back — this customer returned after churning.</p>
        </div>
      ) : suggestChurn && !dismissed ? (
        <div className="mb-5 flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div>
              <p className="text-sm font-semibold text-foreground">Looks churned — confirm?</p>
              <p className="text-xs text-muted-foreground">
                Very low health and near-certain churn probability suggest this account may already be gone.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => setDismissed(true)}
              className="inline-flex items-center justify-center rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
            >
              Still active
            </button>
            <button
              onClick={() => setAskChurn(true)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-danger px-3 py-2 text-sm font-medium text-danger-foreground hover:bg-danger/90"
            >
              <UserMinus className="h-4 w-4" /> Mark as churned
            </button>
          </div>
        </div>
      ) : status === "active" ? (
        <div className="mb-5 flex justify-end">
          <button
            onClick={() => setAskChurn(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <UserMinus className="h-3.5 w-3.5" /> Mark as churned
          </button>
        </div>
      ) : null}

      <PageHeader title={c.name} description={`${c.segment} · ${c.contact} · last active ${c.lastActivity}`}>
        <HealthBadge category={cat} />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Health score" value={c.health} icon={HeartPulse} tone={cat === "healthy" ? "success" : cat === "watch" ? "warning" : cat === "at-risk" ? "caution" : "danger"} />
        <StatCard label="Churn probability" value={`${c.churnProbability}%`} icon={AlertTriangle} tone="danger" />
        <StatCard label="Revenue value" value={formatCurrency(c.revenue)} icon={DollarSign} />
        <StatCard label="Sentiment" value={sentimentLabel} icon={Smile} tone={c.sentiment >= 60 ? "success" : c.sentiment >= 40 ? "warning" : "danger"} hint={`Score ${c.sentiment}/100`} />
      </div>

      <ConnectedIdentities customerId={c.id} />




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
            {analyzedCopy}
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
                {r.steps && r.steps.length > 0 && (
                  <ol className="mt-2 space-y-1.5 text-xs text-foreground">
                    {r.steps.map((s, i) => (
                      <li key={s} className="flex gap-2">
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                          {i + 1}
                        </span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ol>
                )}
                <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                  <span>Difficulty: <span className="font-medium text-foreground">{r.difficulty}</span></span>
                  <span>Impact: <span className="font-medium text-foreground">{r.impact}</span></span>
                  <span>Est. saved: <span className="font-medium text-success">{formatCurrency(r.revenueSaved)}</span></span>
                </div>
              </div>
            ))}

            {c.recommendations.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No actions needed right now — every tracked metric is in a healthy range for this customer.
              </p>
            )}
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




// Every platform id that rolls up to this customer — the record's own id plus
// any ids linked or merged from other connected tools.
function ConnectedIdentities({ customerId }: { customerId: string }) {
  const ingested = useIngested();
  const aliases = useCustomerAliases();
  const identities = customerIdentities(ingested, aliases, customerId);
  if (identities.length === 0) return null;
  const multiple = identities.length > 1;
  return (
    <Card className="mt-6">
      <h3 className="font-semibold">{identityCardTitle(identities.length)}</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {multiple
          ? "This customer's records across your connected platforms. Data from all of them feeds one health score."
          : "Where this customer's records come from. Link another platform's ID to roll it up here."}
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {identities.map((i) => (
          <li
            key={`${i.source}::${i.source_id}`}
            className="flex items-center gap-2 rounded-lg border border-border/60 px-2.5 py-1.5 text-xs"
          >
            <span className="font-medium">{sourceLabel(i.source)}</span>
            <span className="font-mono text-[11px] text-muted-foreground">{i.source_id}</span>
            {multiple && i.primary && (

              <span className="rounded-md border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                master
              </span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
