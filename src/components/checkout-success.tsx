// Post-checkout confirmation. Detects `?checkout=success`, refreshes the
// organisation/plan state (so the trial paywall lifts) and shows a short
// success modal that auto-dismisses.
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";

import { PLAN_LABELS } from "@/lib/organisations";
import { usePlanUsage } from "@/lib/use-plan-usage";

const AUTO_DISMISS_MS = 8000;

export function CheckoutSuccessModal({ enabled = true }: { enabled?: boolean }) {
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data } = usePlanUsage(enabled && open);

  const isSuccess = enabled && search?.checkout === "success";

  useEffect(() => {
    if (!isSuccess) return;
    setOpen(true);
    // The webhook flips the plan server-side; re-read everything that depends
    // on it, with a couple of retries in case the webhook lands a moment later.
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["organisation"] });
    };
    refresh();
    const timers = [setTimeout(refresh, 2500), setTimeout(refresh, 6000)];
    return () => timers.forEach(clearTimeout);
  }, [isSuccess, queryClient]);

  const dismiss = () => {
    setOpen(false);
    void queryClient.invalidateQueries({ queryKey: ["organisation"] });
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", window.location.pathname);
    }
  };

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const planName = data?.plan ? PLAN_LABELS[data.plan] : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Payment successful"
        className="w-full max-w-md rounded-[14px] border border-border bg-card p-8 text-center"
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/15">
          <CheckCircle2 className="h-6 w-6 text-success" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-foreground">
          You're all set! Welcome to ChAi{planName ? ` ${planName}` : ""}.
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your payment was successful. A receipt has been sent to your email.
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="mt-6 inline-flex items-center justify-center rounded-[10px] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Go to my dashboard
        </button>
      </div>
    </div>
  );
}
