// Plan-limit UI: the upgrade confirmation modal, the 80% customer warning
// banner, and the hard-limit notice raised when an import or sync is refused.
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, ArrowUpCircle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PLAN_CUSTOMERS,
  PLAN_LABELS,
  PLAN_PRICING,
  PLAN_SEATS,
  annualSaving,
  canManageMembers,
  nextPlan,
  shouldWarnCustomerLimit,
  type BillingPeriod,
  type OrgPlan,
} from "@/lib/organisations";
import { usePlanUsage, useRefreshPlan } from "@/lib/use-plan-usage";
import { getPaddleEnvironment } from "@/lib/paddle";
import { usePaddleCheckout } from "@/hooks/use-paddle-checkout";
import { getMySubscription, requestPlanChange } from "@/utils/payments.functions";
import { useAuthUserId } from "@/lib/use-auth-state";
import { supabase } from "@/integrations/supabase/client";
import { clearPlanLimitNotice, usePlanLimitNotice } from "@/lib/plan-limit-store";

function limitText(value: number | null) {
  return value === null ? "Unlimited" : value.toLocaleString();
}

function money(n: number) {
  return `$${n.toLocaleString("en-US")}`;
}


export function UpgradePlanDialog({
  plan,
  open,
  onOpenChange,
}: {
  plan: OrgPlan;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const getSubscription = useServerFn(getMySubscription);
  const changePlan = useServerFn(requestPlanChange);
  const refresh = useRefreshPlan();
  const target = nextPlan(plan);
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const userId = useAuthUserId();
  const { openCheckout } = usePaddleCheckout();
  const environment = getPaddleEnvironment();

  const mutation = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error("You're already on our highest plan.");
      const sub = await getSubscription({ data: { environment } });
      if (!sub || sub.status === "none" || !["active", "trialing", "past_due"].includes(sub.status)) {
        // No subscription yet — collect payment through checkout.
        if (!userId) throw new Error("Please sign in again to continue.");
        const { data } = await supabase.auth.getSession();
        await openCheckout({
          plan: target,
          period,
          userId,
          customerEmail: data.session?.user.email ?? undefined,
        });
        return { kind: "checkout" as const };
      }
      return changePlan({ data: { environment, plan: target, period } });
    },
    onSuccess: (result) => {
      if (result.kind === "checkout") {
        // The Paddle overlay is open; close the dialog and let checkout finish.
        onOpenChange(false);
        return;
      }
      if (!target) return;
      if (result.kind === "downgrade-at-renewal") {
        toast.success(
          `${PLAN_LABELS[target]} will start at your next renewal. You keep your current plan until then.`,
        );
      } else {
        toast.success(
          `You're now on ${PLAN_LABELS[target]} (${
            period === "annual" ? "billed annually" : "billed monthly"
          }). Your new limits are active.`,
        );
      }
      onOpenChange(false);
      clearPlanLimitNotice();
      refresh();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "We couldn't change your plan just now."),
  });

  const pricing = target ? PLAN_PRICING[target] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upgrade your plan</DialogTitle>
          <DialogDescription>
            {target
              ? `Move from ${PLAN_LABELS[plan]} to ${PLAN_LABELS[target]} to lift your limits.`
              : "You're already on our highest plan."}
          </DialogDescription>
        </DialogHeader>

        {target && pricing && (
          <>
            <div className="flex items-center justify-center">
              <div className="inline-flex rounded-full border border-border bg-muted/50 p-1 text-sm">
                <button
                  type="button"
                  aria-pressed={period === "monthly"}
                  onClick={() => setPeriod("monthly")}
                  className={`rounded-full px-4 py-1.5 font-medium transition-colors ${
                    period === "monthly" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  aria-pressed={period === "annual"}
                  onClick={() => setPeriod("annual")}
                  className={`flex items-center gap-2 rounded-full px-4 py-1.5 font-medium transition-colors ${
                    period === "annual" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
                  }`}
                >
                  Annual
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.7rem] font-semibold text-primary">
                    Save 10%
                  </span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs uppercase text-muted-foreground">Current</p>
                <p className="font-medium text-foreground">{PLAN_LABELS[plan]}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {limitText(PLAN_CUSTOMERS[plan])} customers
                </p>
                <p className="text-xs text-muted-foreground">{limitText(PLAN_SEATS[plan])} seats</p>
              </div>
              <div className="rounded-lg border border-primary bg-primary/5 p-3">
                <p className="text-xs uppercase text-primary">New</p>
                <p className="font-medium text-foreground">{PLAN_LABELS[target]}</p>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  {money(period === "annual" ? pricing.annualMonthly : pricing.monthly)}
                  <span className="text-xs font-normal text-muted-foreground">/mo</span>
                </p>
                {period === "annual" && (
                  <p className="text-xs text-muted-foreground">
                    billed annually — {money(pricing.annualTotal)}/year
                  </p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  {limitText(PLAN_CUSTOMERS[target])} customers
                </p>
                <p className="text-xs text-muted-foreground">{limitText(PLAN_SEATS[target])} seats</p>
              </div>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              {period === "annual"
                ? `Save ${money(annualSaving(target))}/year with annual billing.`
                : `Switch to annual and save ${money(annualSaving(target))}/year.`}
            </p>
          </>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!target || mutation.isPending}
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm upgrade"}
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}

/** Button + modal pair usable anywhere a limit is mentioned. */
export function UpgradePlanButton({
  plan,
  size = "sm",
  variant = "default",
  label = "Upgrade plan",
}: {
  plan: OrgPlan;
  size?: "sm" | "default";
  variant?: "default" | "secondary" | "outline";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size={size} variant={variant} onClick={() => setOpen(true)}>
        <ArrowUpCircle className="h-4 w-4" /> {label}
      </Button>
      <UpgradePlanDialog plan={plan} open={open} onOpenChange={setOpen} />
    </>
  );
}

const DISMISS_KEY = "chai.customer-limit-banner.dismissed-until";
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

function dismissedRecently(): boolean {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage.getItem(DISMISS_KEY);
  const until = raw ? Number(raw) : 0;
  return Number.isFinite(until) && until > Date.now();
}

export function CustomerLimitBanner({ enabled = true }: { enabled?: boolean }) {
  const { data } = usePlanUsage(enabled);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    setHidden(dismissedRecently());
  }, []);

  if (!data || hidden) return null;
  if (!canManageMembers(data.myRole)) return null;
  if (!shouldWarnCustomerLimit(data.plan, data.customers)) return null;
  const target = data.nextPlan;
  if (!target) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-warning/30 bg-warning/15 px-4 py-3 text-sm text-foreground lg:px-8">
      <AlertTriangle className="h-4 w-4 text-warning" />
      <span className="flex-1">
        You're using {data.customers.toLocaleString()} of your{" "}
        {(data.customersAllowed ?? 0).toLocaleString()} customer slots. Upgrade to{" "}
        {PLAN_LABELS[target]} to add more.
      </span>
      <UpgradePlanButton plan={data.plan} />
      <button
        type="button"
        aria-label="Dismiss"
        className="rounded p-1 text-muted-foreground hover:bg-accent"
        onClick={() => {
          window.localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_MS));
          setHidden(true);
        }}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Blocking notice shown when an import or sync was refused by the plan limit. */
export function PlanLimitNoticeDialog({ enabled = true }: { enabled?: boolean }) {
  const notice = usePlanLimitNotice();
  const { data } = usePlanUsage(enabled);
  const plan = data?.plan ?? "core";

  return (
    <Dialog open={!!notice} onOpenChange={(o) => !o && clearPlanLimitNotice()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>You've reached your customer limit</DialogTitle>
          <DialogDescription>{notice}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => clearPlanLimitNotice()}>
            Close
          </Button>
          <UpgradePlanButton plan={plan} size="default" />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
