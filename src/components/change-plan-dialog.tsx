// "Change plan" modal: shows every tier (not just higher ones) so an owner can
// upgrade immediately or schedule a downgrade for the next billing period.
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Repeat } from "lucide-react";
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
  isCustomPricingPlan,
  type BillingPeriod,
  type OrgPlan,
} from "@/lib/organisations";
import { useRefreshPlan } from "@/lib/use-plan-usage";
import { requestPlanChange } from "@/utils/payments.functions";
import { getPaddleEnvironment } from "@/lib/paddle";

export const CUSTOM_PLAN_MAILTO =
  "mailto:support@askchai.tech?subject=ChAi%20Custom%20Plan%20Enquiry";

function limitText(value: number | null) {
  return value === null ? "Unlimited" : value.toLocaleString();
}

function money(n: number) {
  return `$${n.toLocaleString("en-US")}`;
}

/** Whether the target tier sits above, below or at the current plan. */
export function planDirection(
  current: OrgPlan,
  target: OrgPlan,
): "current" | "upgrade" | "downgrade" {
  const a = ORG_PLANS.indexOf(current);
  const b = ORG_PLANS.indexOf(target);
  if (a === b) return "current";
  return b > a ? "upgrade" : "downgrade";
}

export function ChangePlanDialog({
  plan,
  period: currentPeriod,
  renewalDate,
  open,
  onOpenChange,
}: {
  plan: OrgPlan;
  period?: BillingPeriod | null;
  /** ISO date the current paid period ends; used in the downgrade warning. */
  renewalDate?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const environment = getPaddleEnvironment();
  const changePlan = useServerFn(requestPlanChange);
  const refresh = useRefreshPlan();
  const [period, setPeriod] = useState<BillingPeriod>(currentPeriod ?? "monthly");
  const [selected, setSelected] = useState<OrgPlan>(plan);

  useEffect(() => {
    if (open) {
      setSelected(plan);
      setPeriod(currentPeriod ?? "monthly");
    }
  }, [open, plan, currentPeriod]);

  const renewalLabel = renewalDate
    ? new Date(renewalDate).toLocaleDateString()
    : "your next renewal date";

  const mutation = useMutation({
    mutationFn: async (target: Exclude<OrgPlan, "custom">) => {
      const result = await changePlan({ data: { plan: target, period, environment } });
      return { ...result, plan: target } as const;
    },
    onSuccess: (result) => {
      if (result.kind === "same") {
        toast.info(`You're already on ${PLAN_LABELS[result.plan]}.`);
      } else if (result.kind === "downgrade-renewal") {
        const when = result.effectiveAt
          ? new Date(result.effectiveAt).toLocaleDateString()
          : renewalLabel;
        toast.info(
          `Your plan will change to ${PLAN_LABELS[result.plan]} on ${when}. You keep full access until then.`,
        );
      } else {
        toast.success(
          `You've been moved to ${PLAN_LABELS[result.plan]}. Your card has been charged on a prorated basis.`,
        );
      }
      onOpenChange(false);
      refresh();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "We couldn't change your plan just now."),
  });

  const direction = planDirection(plan, selected);
  const selectedIsCustom = isCustomPricingPlan(selected);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Change your plan</DialogTitle>
          <DialogDescription>
            You're on {PLAN_LABELS[plan]}. Move up for more capacity, or step down from your
            next billing period.
          </DialogDescription>
        </DialogHeader>

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

        <div className="grid gap-3 sm:grid-cols-2">
          {ORG_PLANS.map((option) => {
            const pricing = PLAN_PRICING[option];
            const active = selected === option;
            const dir = planDirection(plan, option);
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
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{PLAN_LABELS[option]}</p>
                  {dir === "current" ? (
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                      Current plan
                    </span>
                  ) : isCustomPricingPlan(option) ? (
                    <span className="text-[11px] font-medium text-muted-foreground">Contact us</span>
                  ) : (
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {dir === "upgrade" ? "Upgrade" : "Downgrade"}
                    </span>
                  )}
                </div>
                {isCustomPricingPlan(option) ? (
                  <p className="mt-1 text-base text-muted-foreground">
                    Custom pricing, tailored to your volume
                  </p>
                ) : (
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {money(period === "annual" ? pricing.annualMonthly : pricing.monthly)}
                    <span className="text-xs font-normal text-muted-foreground">/mo</span>
                    {period === "annual" && (
                      <span className="text-xs font-normal text-muted-foreground">
                        {" "}
                        ({money(pricing.annualTotal)}/year)
                      </span>
                    )}
                  </p>
                )}
                <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                  <li>
                    {isCustomPricingPlan(option) ? "Custom" : limitText(PLAN_CUSTOMERS[option])}{" "}
                    customers
                  </li>
                  <li>
                    {isCustomPricingPlan(option) ? "Custom" : limitText(PLAN_SEATS[option])} seats
                  </li>
                </ul>
              </button>
            );
          })}
        </div>

        {direction === "upgrade" && !selectedIsCustom && (
          <p className="text-xs text-muted-foreground">
            Upgrades apply immediately and your card is charged on a prorated basis.
          </p>
        )}
        {direction === "downgrade" && (
          <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
            This change takes effect on {renewalLabel}. You keep your current plan until then.
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {selectedIsCustom ? (
            <Button asChild>
              <a href={CUSTOM_PLAN_MAILTO}>Contact us</a>
            </Button>
          ) : (
            <Button
              onClick={() => mutation.mutate(selected as Exclude<OrgPlan, "custom">)}
              disabled={direction === "current" || mutation.isPending}
            >
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : direction === "downgrade" ? (
                `Confirm downgrade to ${PLAN_LABELS[selected]}`
              ) : direction === "upgrade" ? (
                `Confirm upgrade to ${PLAN_LABELS[selected]}`
              ) : (
                "Confirm change"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Button + modal pair for the billing section. */
export function ChangePlanButton({
  plan,
  period,
  renewalDate,
}: {
  plan: OrgPlan;
  period?: BillingPeriod | null;
  renewalDate?: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Repeat className="h-4 w-4" /> Change plan
      </Button>
      <ChangePlanDialog
        plan={plan}
        period={period}
        renewalDate={renewalDate}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
