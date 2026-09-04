// Billing Admin: a ChAi-admin-only view of every customer's Paddle
// subscription, with refund, cancel, plan-change and portal actions.
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { DollarSign, Loader2, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { PageHeader, Card } from "@/components/ui/chai";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  adminCancelSubscription,
  adminChangePlan,
  adminLastPayment,
  adminOpenPortal,
  adminRefundLastPayment,
  listBilling,
  type AdminBillingRow,
} from "@/lib/admin.functions";
import { getPaddleEnvironment } from "@/lib/paddle";
import { isFounderCode } from "@/lib/promo-codes";
import {
  ORG_PLANS,
  PLAN_LABELS,
  PLAN_PRICING,
  type BillingPeriod,
  type OrgPlan,
} from "@/lib/organisations";

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  trialing: "Trialing",
  canceled: "Cancelled",
  cancelled: "Cancelled",
  past_due: "Past due",
  paused: "Paused",
  none: "No subscription",
};

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "active" || status === "trialing"
      ? "bg-success/10 text-success"
      : status === "past_due"
        ? "bg-warning/15 text-warning-foreground"
        : "bg-secondary text-muted-foreground";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

type CancelMode = "period-end" | "immediate";

export function AdminBilling() {
  const environment = getPaddleEnvironment();
  const fetchBilling = useServerFn(listBilling);
  const lastPayment = useServerFn(adminLastPayment);
  const refund = useServerFn(adminRefundLastPayment);
  const cancel = useServerFn(adminCancelSubscription);
  const changePlan = useServerFn(adminChangePlan);
  const openPortal = useServerFn(adminOpenPortal);

  const [rows, setRows] = useState<AdminBillingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [refundTarget, setRefundTarget] = useState<AdminBillingRow | null>(null);
  const [refundAmount, setRefundAmount] = useState<number | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ row: AdminBillingRow; mode: CancelMode } | null>(null);
  const [planTarget, setPlanTarget] = useState<AdminBillingRow | null>(null);
  const [planChoice, setPlanChoice] = useState<OrgPlan>("standard");
  const [periodChoice, setPeriodChoice] = useState<BillingPeriod>("monthly");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await fetchBilling({ data: { environment } })) as AdminBillingRow[]);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [fetchBilling, environment]);

  useEffect(() => {
    void load();
  }, [load]);

  const mrr = rows.reduce((s, r) => s + r.monthlyValueUsd, 0);

  async function startRefund(row: AdminBillingRow) {
    setRefundTarget(row);
    setRefundAmount(null);
    try {
      const txn = await lastPayment({ data: { userId: row.userId, environment } });
      setRefundAmount(txn ? txn.amount : 0);
    } catch {
      setRefundAmount(0);
    }
  }

  async function confirmRefund() {
    const row = refundTarget;
    setRefundTarget(null);
    if (!row) return;
    setBusyId(row.userId);
    try {
      await refund({ data: { userId: row.userId, environment } });
      toast.success("Refund issued — may take 5–10 business days.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't issue the refund");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmCancel() {
    const target = cancelTarget;
    setCancelTarget(null);
    if (!target) return;
    const { row, mode } = target;
    setBusyId(row.userId);
    try {
      const res = await cancel({
        data: { userId: row.userId, environment, immediately: mode === "immediate" },
      });
      const name = row.fullName || row.email;
      toast.success(
        mode === "immediate"
          ? `Subscription cancelled — ${name} has lost access immediately.`
          : `Subscription cancelled — ${name} keeps access until ${shortDate(res.accessUntil)}.`,
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't cancel the subscription");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmPlanChange() {
    const row = planTarget;
    setPlanTarget(null);
    if (!row) return;
    setBusyId(row.userId);
    try {
      const res = await changePlan({
        data: { userId: row.userId, environment, plan: planChoice, period: periodChoice },
      });
      if (res.kind === "same") toast.info("That's already their current plan.");
      else if (res.kind === "upgrade-now")
        toast.success(`Upgraded to ${PLAN_LABELS[planChoice]} — billed pro rata now.`);
      else
        toast.success(
          `Downgrade to ${PLAN_LABELS[planChoice]} scheduled for ${shortDate(res.effectiveAt ?? null)}.`,
        );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't change the plan");
    } finally {
      setBusyId(null);
    }
  }

  async function handlePortal(row: AdminBillingRow) {
    setBusyId(row.userId);
    try {
      const { url } = await openPortal({ data: { userId: row.userId, environment } });
      window.open(url, "_blank", "noopener");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't open the billing portal");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-10">
      <PageHeader
        title="Billing admin"
        description="Subscriptions, plan changes, refunds and cancellations across every customer account."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <DollarSign className="h-4 w-4" />
            <span className="text-xs font-medium">Monthly recurring revenue</span>
          </div>
          <p className="mt-2 text-xl font-semibold">{usd(mrr)}</p>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        {loading ? (
          <div className="flex items-center justify-center px-6 py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-muted-foreground">
            No billing records yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">Billing</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Period ends</th>
                  <th className="px-4 py-3 font-medium">Pending change</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.userId} className="hover:bg-accent/40">
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.fullName || "—"}</div>
                      <a href={`mailto:${r.email}`} className="text-xs text-primary hover:underline">
                        {r.email}
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      {r.plan ? PLAN_LABELS[r.plan] : "—"}
                      {isFounderCode(r.promoCode) && (
                        <span className="ml-2 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                          Founder Plan
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 capitalize">{r.period ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                      {r.cancelAtPeriodEnd && (
                        <div className="mt-1 text-[11px] text-muted-foreground">Cancels at period end</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{shortDate(r.currentPeriodEnd)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.pendingPlan
                        ? `Downgrading to ${PLAN_LABELS[r.pendingPlan]} on ${shortDate(r.pendingPlanEffectiveAt)}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              disabled={busyId === r.userId}
                              aria-label={`Billing actions for ${r.fullName || r.email}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border transition-colors hover:bg-accent disabled:opacity-50"
                            >
                              {busyId === r.userId ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MoreHorizontal className="h-4 w-4" />
                              )}
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuItem onSelect={() => void startRefund(r)}>
                              Refund last payment
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => setCancelTarget({ row: r, mode: "period-end" })}
                            >
                              Cancel subscription
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() => setCancelTarget({ row: r, mode: "immediate" })}
                            >
                              Cancel immediately
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => {
                                setPlanChoice(r.plan ?? "core");
                                setPeriodChoice(r.period ?? "monthly");
                                setPlanTarget(r);
                              }}
                            >
                              Change plan
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => void handlePortal(r)}>
                              Open Paddle portal
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Refund confirmation */}
      <AlertDialog open={refundTarget !== null} onOpenChange={(o) => !o && setRefundTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {refundAmount === null
                ? "Checking the last payment…"
                : `Refund ${usd(refundAmount)} to ${refundTarget?.fullName || refundTarget?.email}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmRefund()}
            >
              Yes, refund
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancellation confirmation */}
      <AlertDialog open={cancelTarget !== null} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {cancelTarget?.mode === "immediate"
                ? `Cancel ${cancelTarget?.row.fullName || cancelTarget?.row.email} immediately?`
                : `Cancel ${cancelTarget?.row.fullName || cancelTarget?.row.email}'s subscription at period end?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget?.mode === "immediate"
                ? "They lose access to ChAi right now, mid-period, with no refund issued automatically. This cannot be undone."
                : `They keep full access until ${shortDate(cancelTarget?.row.currentPeriodEnd ?? null)}, then the subscription ends.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmCancel()}
            >
              Yes, cancel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Plan change */}
      <Dialog open={planTarget !== null} onOpenChange={(o) => !o && setPlanTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change plan</DialogTitle>
            <DialogDescription>
              Upgrades bill immediately (pro rata). Downgrades take effect at the next renewal.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            {(["monthly", "annual"] as BillingPeriod[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriodChoice(p)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium capitalize transition-colors ${
                  periodChoice === p ? "border-primary bg-primary/10" : "border-border hover:bg-accent"
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="mt-2 grid gap-2">
            {ORG_PLANS.map((plan) => {
              const price =
                periodChoice === "annual"
                  ? PLAN_PRICING[plan].annualMonthly
                  : PLAN_PRICING[plan].monthly;
              return (
                <button
                  key={plan}
                  onClick={() => setPlanChoice(plan)}
                  className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                    planChoice === plan ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
                  }`}
                >
                  <span className="text-sm font-medium">{PLAN_LABELS[plan]}</span>
                  <span className="text-sm text-muted-foreground">${price}/mo</span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setPlanTarget(null)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Cancel
            </button>
            <button
              onClick={() => void confirmPlanChange()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Confirm change
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
