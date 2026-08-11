// Payment step: shown right after signup and before the company-information
// onboarding flow. PayPal captures the payment details now and only charges
// after the 2-week free trial ends.
import { useCallback, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Loader2, ShieldCheck } from "lucide-react";
import { PayPalSubscribeButton } from "@/components/paypal-subscribe-button";
import { activatePaypalSubscription } from "@/lib/billing.functions";
import { PAYPAL_MONTHLY_PLAN_ID } from "@/lib/paypal-config";

export const Route = createFileRoute("/_authenticated/start-trial")({
  head: () => ({
    meta: [
      { title: "Start your free trial — ChAi" },
      {
        name: "description",
        content:
          "Add your payment details to start your 2-week free ChAi trial. You won't be charged until the trial ends.",
      },
      { property: "og:title", content: "Start your free trial — ChAi" },
      {
        property: "og:description",
        content: "Add your payment details to start your 2-week free ChAi trial.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StartTrial,
});

const PERKS = [
  "2 weeks free — cancel any time before it ends",
  "Personalized customer health scores",
  "AI insights that update as your data changes",
  "Native integrations and CSV uploads",
  "ChAi AI assistant included",
];

function StartTrial() {
  const navigate = useNavigate();
  const activate = useServerFn(activatePaypalSubscription);
  const [saving, setSaving] = useState(false);

  const onApproved = useCallback(
    async (subscriptionId: string) => {
      setSaving(true);
      try {
        await activate({ data: { subscriptionId, planId: PAYPAL_MONTHLY_PLAN_ID } });
        toast.success("Free trial started", {
          description: "You won't be charged until your 2-week trial ends.",
        });
        await navigate({ to: "/onboarding" });
      } catch (e) {
        toast.error("We couldn't start your trial", {
          description: e instanceof Error ? e.message : "Please try again or contact support.",
        });
        setSaving(false);
      }
    },
    [activate, navigate],
  );

  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <ShieldCheck className="h-3.5 w-3.5" /> Step 1 of 2 — payment details
          </span>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">Start your 2-week free trial</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Add your payment details through PayPal to activate ChAi. Your trial runs free for two
            weeks — billing only starts after that, and you can cancel any time from Billing.
          </p>
        </div>

        <div className="mt-10 grid gap-8 rounded-2xl border border-border bg-card p-6 md:grid-cols-2 md:p-8">
          <div>
            <h2 className="font-semibold">ChAi Monthly</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Billed monthly after your free trial. Cancel any time.
            </p>
            <ul className="mt-4 space-y-2">
              {PERKS.map((p) => (
                <li key={p} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-border bg-accent/20 p-5">
            <p className="text-sm font-medium">Set up with PayPal</p>
            <p className="mt-1 text-xs text-muted-foreground">
              You'll review everything in PayPal before confirming. No charge today.
            </p>
            <div className="mt-4">
              {saving ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Starting your trial…
                </div>
              ) : (
                <PayPalSubscribeButton onApproved={onApproved} />
              )}
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Next: tell us about your company so ChAi can personalize your metrics.
        </p>
      </div>
    </div>
  );
}
