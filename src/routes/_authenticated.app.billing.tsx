import { useCallback, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, CreditCard, Loader2 } from "lucide-react";
import { PageHeader, Card } from "@/components/ui/chai";
import { PayPalSubscribeButton } from "@/components/paypal-subscribe-button";
import {
  activatePaypalSubscription,
  cancelMySubscription,
  getMySubscription,
} from "@/lib/billing.functions";
import { PAYPAL_MONTHLY_PLAN_ID } from "@/lib/paypal-config";

export const Route = createFileRoute("/_authenticated/app/billing")({
  head: () => ({
    meta: [
      { title: "Billing & subscription — ChAi" },
      {
        name: "description",
        content: "Manage your ChAi monthly subscription, payment method and billing status.",
      },
      { property: "og:title", content: "Billing & subscription — ChAi" },
      {
        property: "og:description",
        content: "Manage your ChAi monthly subscription and billing status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Billing,
});

const PERKS = [
  "Personalized customer health scores",
  "AI insights that update as your data changes",
  "Native integrations and CSV uploads",
  "Identity resolution and duplicate merging",
  "ChAi AI assistant included",
];

function statusTone(status: string) {
  if (status === "ACTIVE") return "bg-success/10 text-success";
  if (status === "CANCELLED" || status === "SUSPENDED") return "bg-danger/10 text-danger";
  return "bg-warning/10 text-warning";
}

function Billing() {
  const queryClient = useQueryClient();
  const fetchSub = useServerFn(getMySubscription);
  const activate = useServerFn(activatePaypalSubscription);
  const cancel = useServerFn(cancelMySubscription);
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const { data: sub, isLoading } = useQuery({
    queryKey: ["subscription"],
    queryFn: () => fetchSub({}),
  });

  const onApproved = useCallback(
    async (subscriptionId: string) => {
      setSaving(true);
      try {
        const res = await activate({
          data: { subscriptionId, planId: PAYPAL_MONTHLY_PLAN_ID },
        });
        toast.success("Subscription active", {
          description: res.verified
            ? "Thanks! Your ChAi monthly plan is now live."
            : "Payment received — we'll confirm the details with PayPal shortly.",
        });
        await queryClient.invalidateQueries({ queryKey: ["subscription"] });
      } catch (e) {
        toast.error("We couldn't record your subscription", {
          description: e instanceof Error ? e.message : "Please contact support.",
        });
      } finally {
        setSaving(false);
      }
    },
    [activate, queryClient],
  );

  const active = sub && sub.status !== "CANCELLED" && sub.status !== "EXPIRED";

  return (
    <div>
      <PageHeader
        title="Billing & subscription"
        description="Your ChAi plan, billed monthly through PayPal."
      />

      {isLoading ? (
        <Card className="mt-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your subscription…
          </div>
        </Card>
      ) : active ? (
        <Card className="mt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <CreditCard className="h-4 w-4" />
                </span>
                <h3 className="font-semibold">ChAi Monthly</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusTone(sub!.status)}`}
                >
                  {sub!.status}
                </span>
              </div>
              <dl className="mt-4 space-y-1 text-xs text-muted-foreground">
                <div>
                  Subscription ID:{" "}
                  <span className="font-mono">{sub!.provider_subscription_id}</span>
                </div>
                {sub!.payer_email && <div>Billed to: {sub!.payer_email}</div>}
                {sub!.current_period_end && (
                  <div>
                    Next payment: {new Date(sub!.current_period_end).toLocaleDateString()}
                  </div>
                )}
              </dl>
            </div>
            <button
              disabled={cancelling}
              onClick={async () => {
                if (!window.confirm("Cancel your ChAi subscription?")) return;
                setCancelling(true);
                try {
                  await cancel({});
                  toast.success("Subscription cancelled", {
                    description: "You keep access until the end of the current billing period.",
                  });
                  await queryClient.invalidateQueries({ queryKey: ["subscription"] });
                } catch (e) {
                  toast.error("Cancellation failed", {
                    description: e instanceof Error ? e.message : "Please contact support.",
                  });
                } finally {
                  setCancelling(false);
                }
              }}
              className="shrink-0 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
            >
              {cancelling ? "Cancelling…" : "Cancel subscription"}
            </button>
          </div>
        </Card>
      ) : (
        <Card className="mt-6">
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <h3 className="font-semibold">ChAi Monthly</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Everything in ChAi, billed monthly. Cancel any time.
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
              <p className="text-sm font-medium">Subscribe with PayPal</p>
              <p className="mt-1 text-xs text-muted-foreground">
                You'll be able to review the amount in PayPal before confirming.
              </p>
              <div className="mt-4">
                {saving ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Activating your plan…
                  </div>
                ) : (
                  <PayPalSubscribeButton onApproved={onApproved} />
                )}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
