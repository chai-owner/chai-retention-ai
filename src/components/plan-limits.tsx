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
  ORG_PLANS,
  PLAN_CUSTOMERS,
  PLAN_LABELS,
  PLAN_PRICING,
  PLAN_SEATS,
  annualSaving,
  canManageMembers,
  shouldWarnCustomerLimit,
  type OrgPlan,
} from "@/lib/organisations";
import { usePlanUsage, useRefreshPlan } from "@/lib/use-plan-usage";
import { upgradeOrganisationPlan } from "@/lib/organisations.functions";
import { clearPlanLimitNotice, usePlanLimitNotice } from "@/lib/plan-limit-store";

function limitText(value: number | null) {
  return value === null ? "Unlimited" : value.toLocaleString();
}

function money(n: number) {
  return `$${n.toLocaleString("en-US")}`;
}


/** Short, plain-English highlights shown on each upgrade card. */
const PLAN_FEATURES: Record<OrgPlan, string[]> = {
  core: ["Daily risk scoring", "CSV Data Drop add-on", "Email support"],
  standard: [
    "Everything in Core",
    "All integrations (CRM, support, accounting)",
    "Team seats and shared workspace",
  ],
  enterprise: [
    "Everything in Standard",
    "Unlimited customers and seats",
    "Priority support and onboarding help",
  ],
};

/** Every tier above the current plan, so the user can pick where to land. */
function higherPlans(plan: OrgPlan): OrgPlan[] {
  return ORG_PLANS.slice(ORG_PLANS.indexOf(plan) + 1);
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
  const changePlan = useServerFn(requestPlanChange);
  const refresh = useRefreshPlan();
  const userId = useAuthUserId();
  const { openCheckout, environment } = usePaddleCheckout();
  const options = higherPlans(plan);
  const [selected, setSelected] = useState<OrgPlan | null>(options[0] ?? null);
  const [period, setPeriod] = useState<BillingPeriod>("monthly");

  useEffect(() => {
    if (open) {
      setSelected(higherPlans(plan)[0] ?? null);
      setPeriod("monthly");
    }
  }, [open, plan]);

  // No Paddle subscription yet: send them through the full checkout overlay so
  // the subscription gets created before any plan change is possible.
  const startCheckout = async (target: OrgPlan) => {
    if (!userId) throw new Error("Please sign in again to change your plan.");
    const { data } = await supabase.auth.getSession();
    await openCheckout({
      plan: target,
      period,
      userId,
      customerEmail: data.session?.user.email ?? undefined,
    });
    onOpenChange(false);
  };

  const mutation = useMutation({
    mutationFn: async (target: OrgPlan) => {
      try {
        const result = await changePlan({ data: { plan: target, period, environment } });
        return { ...result, plan: target } as const;
      } catch (e) {
        if (e instanceof Error && /no active subscription/i.test(e.message)) {
          await startCheckout(target);
          return null;
        }
        throw e;
      }
    },
    onSuccess: (result) => {
      if (!result) return;
      if (result.kind === "downgrade-renewal") {
        const when = result.effectiveAt
          ? new Date(result.effectiveAt).toLocaleDateString()
          : "your next renewal";
        toast.info(
          `Your plan will change to ${PLAN_LABELS[result.plan]} on ${when}. You'll keep your current plan until then.`,
        );
      } else if (result.kind === "same") {
        toast.info(`You're already on ${PLAN_LABELS[result.plan]}.`);
      } else {
        toast.success(
          `You've been upgraded to ${PLAN_LABELS[result.plan]}. Your card has been charged on a prorated basis.`,
        );
      }
      onOpenChange(false);
      clearPlanLimitNotice();
      refresh();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "We couldn't change your plan just now."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upgrade your plan</DialogTitle>
          <DialogDescription>
            {options.length
              ? `You're on ${PLAN_LABELS[plan]}. Choose the plan you'd like to move to.`
              : "You're already on our highest plan."}
          </DialogDescription>
        </DialogHeader>

        {options.length > 0 && (
          <div className="flex items-center gap-2">
            {(["monthly", "annual"] as BillingPeriod[]).map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={period === option ? "default" : "outline"}
                aria-pressed={period === option}
                onClick={() => setPeriod(option)}
              >
                {option === "monthly" ? "Monthly" : "Annual (save 10%)"}
              </Button>
            ))}
          </div>
        )}

        {options.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {options.map((option) => {
              const pricing = PLAN_PRICING[option];
              const active = selected === option;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelected(option)}
                  className={`rounded-[14px] border p-4 text-left transition-colors ${
                    active
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50 hover:bg-muted/40"
                  }`}
                >
                  <p className="text-sm font-semibold text-foreground">{PLAN_LABELS[option]}</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {money(pricing.monthly)}
                    <span className="text-xs font-normal text-muted-foreground">/mo</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    or {money(pricing.annualMonthly)}/mo billed annually (
                    {money(pricing.annualTotal)}/year — save {money(annualSaving(option))})
                  </p>
                  <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                    <li>{limitText(PLAN_CUSTOMERS[option])} customers</li>
                    <li>{limitText(PLAN_SEATS[option])} seats</li>
                    {PLAN_FEATURES[option].map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => selected && mutation.mutate(selected)}
            disabled={!selected || mutation.isPending}
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : selected ? (
              `Confirm upgrade to ${PLAN_LABELS[selected]}`
            ) : (
              "Confirm upgrade"
            )}
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
