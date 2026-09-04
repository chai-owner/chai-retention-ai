// Trial countdown badge, grace-period banner, expired paywall and the
// locked-seat notice. All read one shared access snapshot.
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Lock, Clock, AlertTriangle, Check, Loader2 } from "lucide-react";

import { useAccessState } from "@/lib/use-access-state";
import { trialBadgeLabel } from "@/lib/trials";
import {
  ORG_PLANS,
  PLAN_CUSTOMERS,
  PLAN_LABELS,
  PLAN_PRICING,
  PLAN_SEATS,
  type BillingPeriod,
  type OrgPlan,
} from "@/lib/organisations";
import { requestPlanChange } from "@/utils/payments.functions";
import { usePaddleCheckout } from "@/hooks/use-paddle-checkout";
import { useAuthUserId } from "@/lib/use-auth-state";
import { supabase } from "@/integrations/supabase/client";
import { useRefreshPlan } from "@/lib/use-plan-usage";
import { cn } from "@/lib/utils";
import { PromoCodeField } from "@/components/promo-code-field";
import {
  FOUNDER_BANNER_MESSAGE,
  FOUNDER_MONTHLY_PRICE,
  FOUNDER_PLAN,
  readStoredPromoCode,
} from "@/lib/promo-codes";


/** Small countdown chip for the sidebar / header. */
export function TrialBadge({ enabled = true }: { enabled?: boolean }) {
  const { data } = useAccessState(enabled);
  const label = data ? trialBadgeLabel(data.trial) : null;
  if (!label) return null;
  return (
    <Link
      to="/pricing"
      className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
    >
      <Clock className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}

/** Persistent banner shown through the 7-day grace period. */
export function TrialGraceBanner({ enabled = true }: { enabled?: boolean }) {
  const { data } = useAccessState(enabled);
  if (!data || data.trial.status !== "grace") return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-warning/30 bg-warning/10 px-4 py-2.5 text-sm lg:px-8">
      <span className="flex items-center gap-2 text-foreground">
        <AlertTriangle className="h-4 w-4 text-warning" />
        Your free trial has ended. You have {data.trial.daysLeft}{" "}
        {data.trial.daysLeft === 1 ? "day" : "days"} of access left.
      </span>
      <Link
        to="/pricing"
        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
      >
        Choose a plan
      </Link>
    </div>
  );
}

function FullScreenNotice({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-8 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-secondary">
          <Lock className="h-5 w-5 text-muted-foreground" />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-foreground">{title}</h1>
        <div className="mt-2 text-sm text-muted-foreground">{children}</div>
        {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}

/**
 * Wraps the app. Blocks the workspace once the trial and grace period have
 * both passed, or when this member's seat was locked by a downgrade. Signing
 * in and the account data itself are untouched.
 */
export function AccessGate({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  const { data } = useAccessState(enabled);

  if (enabled && data?.seatLocked) {
    return (
      <FullScreenNotice title="Your seat is currently locked">
        Your workspace moved to a smaller plan, so some seats were suspended. Your
        account and data are safe — ask your workspace owner to upgrade or free up
        a seat to restore your access.
      </FullScreenNotice>
    );
  }

  if (enabled && data?.paywalled) {
    return <TrialExpiredPaywall />;
  }


  return <>{children}</>;
}

// --- Expired-trial paywall ---------------------------------------------------

const PAYWALL_FEATURES: Record<OrgPlan, string[]> = {
  core: ["Daily risk scoring", "Email support"],
  standard: ["All integrations (CRM, support, accounting)", "Team seats and shared workspace"],
  enterprise: ["Everything in Standard", "Priority support and onboarding help"],
};

function limitLabel(value: number | null) {
  return value === null ? "Unlimited" : value.toLocaleString();
}

/**
 * Full-screen plan picker shown once the trial and grace period have run out.
 * Existing subscribers (grace-period upgraders) go through `requestPlanChange`;
 * everyone else goes through the Paddle checkout overlay.
 */
export function TrialExpiredPaywall() {
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const [pending, setPending] = useState<OrgPlan | null>(null);
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [initialPromo, setInitialPromo] = useState<string | null>(null);
  const changePlan = useServerFn(requestPlanChange);
  const { openCheckout, environment } = usePaddleCheckout();
  const userId = useAuthUserId();
  const refresh = useRefreshPlan();

  // A Founder invite link stored the code before sign-up.
  useEffect(() => {
    setInitialPromo(readStoredPromoCode());
  }, []);

  const startCheckout = async (plan: OrgPlan) => {
    if (!userId) throw new Error("Please sign in again to choose a plan.");
    const { data } = await supabase.auth.getSession();
    await openCheckout({
      plan,
      period,
      userId,
      customerEmail: data.session?.user.email ?? undefined,
      discountCode: plan === FOUNDER_PLAN ? promoCode : null,
    });
  };

  const mutation = useMutation({
    mutationFn: async (plan: OrgPlan) => {
      setPending(plan);
      try {
        const result = await changePlan({ data: { plan, period, environment } });
        return { ...result, plan } as const;
      } catch (e) {
        if (e instanceof Error && /no active subscription/i.test(e.message)) {
          await startCheckout(plan);
          return null;
        }
        throw e;
      }
    },
    onSettled: () => setPending(null),
    onSuccess: (result) => {
      if (!result) return;
      toast.success(`You're now on ${PLAN_LABELS[result.plan]}. Welcome back.`);
      refresh();
      window.location.assign("/app/today?checkout=success");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "We couldn't start that plan just now."),
  });

  return (
    <div className="flex min-h-[80vh] items-center justify-center p-6">
      <div className="w-full max-w-5xl">
        {initialPromo ? (
          <div className="mx-auto mb-6 max-w-2xl rounded-[12px] border border-success/30 bg-success/10 px-4 py-3 text-center text-sm font-medium text-success">
            {FOUNDER_BANNER_MESSAGE}
          </div>
        ) : null}
        <div className="text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-secondary">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-foreground">
            Your free trial has ended
          </h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
            You've had 14 days of full Standard access. Choose a plan to keep your data
            and continue protecting your revenue.
          </p>

          <div className="mt-6 inline-flex rounded-[10px] border border-border bg-card p-1">
            {(["monthly", "annual"] as BillingPeriod[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setPeriod(option)}
                className={cn(
                  "rounded-[8px] px-4 py-1.5 text-sm font-medium capitalize transition-colors",
                  period === option
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option === "annual" ? "Annual (save 10%)" : "Monthly"}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {ORG_PLANS.map((plan) => {
            const pricing = PLAN_PRICING[plan];
            const highlighted = plan === "standard";
            const founder = !!promoCode && plan === FOUNDER_PLAN && period === "monthly";
            return (
              <div
                key={plan}
                className={cn(
                  "relative flex flex-col rounded-[14px] border bg-card p-6 text-left",
                  highlighted ? "border-primary ring-1 ring-primary" : "border-border",
                )}
              >
                {founder ? (
                  <span className="absolute -top-3 left-6 rounded-full bg-success px-3 py-1 text-xs font-medium text-success-foreground">
                    Founder Plan
                  </span>
                ) : highlighted ? (
                  <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                    Most popular
                  </span>
                ) : null}
                <h2 className="text-base font-semibold text-foreground">
                  {PLAN_LABELS[plan]}
                </h2>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {founder ? (
                    <span className="mr-2 text-base font-normal text-muted-foreground line-through">
                      ${pricing.monthly}
                    </span>
                  ) : null}
                  ${founder
                    ? FOUNDER_MONTHLY_PRICE
                    : period === "annual"
                      ? pricing.annualMonthly
                      : pricing.monthly}
                  <span className="text-sm font-normal text-muted-foreground">/mo</span>
                </p>
                {period === "annual" ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    ${pricing.annualTotal.toLocaleString("en-US")} billed yearly
                  </p>
                ) : null}


                <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 text-success" />
                    {limitLabel(PLAN_CUSTOMERS[plan])} customers
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 text-success" />
                    {limitLabel(PLAN_SEATS[plan])} {PLAN_SEATS[plan] === 1 ? "seat" : "seats"}
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 text-success" />
                    {plan === "core" ? "Data Drop available as an add-on" : "Data Drop included"}
                  </li>
                  {PAYWALL_FEATURES[plan].map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 text-success" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => mutation.mutate(plan)}
                  disabled={mutation.isPending}
                  className={cn(
                    "mt-6 inline-flex items-center justify-center gap-2 rounded-[10px] px-4 py-2 text-sm font-medium disabled:opacity-60",
                    highlighted
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-secondary text-foreground",
                  )}
                >
                  {pending === plan ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Choose {PLAN_LABELS[plan]}
                </button>
              </div>
            );
          })}
        </div>

        <PromoCodeField
          className="mt-6"
          appliedCode={promoCode}
          onApply={setPromoCode}
          initialCode={initialPromo}
        />

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Your data is safe — all 14 days of insights are waiting for you.
        </p>
      </div>
    </div>
  );
}
