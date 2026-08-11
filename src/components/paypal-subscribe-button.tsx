// Renders the PayPal subscribe button by loading the PayPal JS SDK on the
// client only. On approval we hand the subscription ID to the server, which
// verifies it with PayPal before unlocking the account.
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { PAYPAL_CLIENT_ID, PAYPAL_MONTHLY_PLAN_ID } from "@/lib/paypal-config";

const SCRIPT_ID = "paypal-sdk-subscriptions";

function loadSdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as unknown as { paypal?: unknown }).paypal) return Promise.resolve();
  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("PayPal SDK failed to load")));
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&vault=true&intent=subscription`;
    script.setAttribute("data-sdk-integration-source", "button-factory");
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("PayPal SDK failed to load"));
    document.body.appendChild(script);
  });
}

export function PayPalSubscribeButton({
  planId = PAYPAL_MONTHLY_PLAN_ID,
  onApproved,
}: {
  planId?: string;
  onApproved: (subscriptionId: string) => void | Promise<void>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendered = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadSdk()
      .then(() => {
        if (cancelled || rendered.current || !containerRef.current) return;
        const paypal = (window as unknown as { paypal?: any }).paypal;
        if (!paypal?.Buttons) throw new Error("PayPal SDK unavailable");
        rendered.current = true;
        paypal
          .Buttons({
            style: { shape: "pill", color: "gold", layout: "vertical", label: "subscribe" },
            createSubscription: (_data: unknown, actions: any) =>
              actions.subscription.create({ plan_id: planId }),
            onApprove: async (data: { subscriptionID: string }) => {
              await onApproved(data.subscriptionID);
            },
            onError: (err: unknown) => {
              setError(err instanceof Error ? err.message : "PayPal checkout failed");
            },
          })
          .render(containerRef.current);
        setLoading(false);
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [planId, onApproved]);

  return (
    <div>
      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading secure PayPal checkout…
        </div>
      )}
      <div ref={containerRef} />
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
