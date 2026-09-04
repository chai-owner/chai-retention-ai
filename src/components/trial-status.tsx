// Trial countdown badge, grace-period banner, expired paywall and the
// locked-seat notice. All read one shared access snapshot.
import { useState } from "react";
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
    return (
      <FullScreenNotice
        title="Your free trial has ended"
        action={
          <Link
            to="/pricing"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Choose a plan
          </Link>
        }
      >
        Nothing has been deleted. Every customer, import and score is waiting for
        you — choose a plan to unlock your workspace again.
      </FullScreenNotice>
    );
  }

  return <>{children}</>;
}
