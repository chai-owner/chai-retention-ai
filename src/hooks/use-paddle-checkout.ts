// Opens the Paddle overlay checkout for a plan (+ optional Smart Ingest
// add-on as a second line item on monthly Core).
import { useState } from "react";

import { initializePaddle, getPaddlePriceId, getPaddleEnvironment } from "@/lib/paddle";
import { ADDON_PRICE_ID, PLAN_PRICE_IDS } from "@/lib/paddle-shared";
import type { BillingPeriod, OrgPlan } from "@/lib/organisations";

export function usePaddleCheckout() {
  const [loading, setLoading] = useState(false);

  const openCheckout = async (options: {
    plan: OrgPlan;
    period: BillingPeriod;
    includeAddon?: boolean;
    userId: string;
    customerEmail?: string;
    /** Promo code (e.g. the Founder Plan code) applied at checkout. */
    discountCode?: string | null;
  }) => {
    setLoading(true);
    try {
      await initializePaddle();
      const priceId = PLAN_PRICE_IDS[options.plan][options.period];
      const items = [{ priceId: await getPaddlePriceId(priceId), quantity: 1 }];
      // Paddle requires all recurring items to share a billing interval, so
      // the monthly add-on can only ride along on the monthly plan.
      if (options.includeAddon && options.period === "monthly") {
        items.push({ priceId: await getPaddlePriceId(ADDON_PRICE_ID), quantity: 1 });
      }

      window.Paddle.Checkout.open({
        items,
        ...(options.discountCode ? { discountCode: options.discountCode } : {}),
        customer: options.customerEmail ? { email: options.customerEmail } : undefined,
        // The webhook attributes the purchase to this user and their workspace.
        customData: {
          userId: options.userId,
          ...(options.discountCode ? { promoCode: options.discountCode } : {}),
        },
        settings: {
          displayMode: "overlay",
          successUrl: `${window.location.origin}/app/today?checkout=success`,
          allowLogout: false,
          variant: "one-page",
        },
      });
    } finally {
      setLoading(false);
    }
  };

  const openAddonCheckout = async (options: { userId: string; customerEmail?: string }) => {
    setLoading(true);
    try {
      await initializePaddle();
      window.Paddle.Checkout.open({
        items: [{ priceId: await getPaddlePriceId(ADDON_PRICE_ID), quantity: 1 }],
        customer: options.customerEmail ? { email: options.customerEmail } : undefined,
        customData: { userId: options.userId },
        settings: {
          displayMode: "overlay",
          successUrl: `${window.location.origin}/app/today?checkout=success`,
          allowLogout: false,
          variant: "one-page",
        },
      });
    } finally {
      setLoading(false);
    }
  };

  return { openCheckout, openAddonCheckout, loading, environment: getPaddleEnvironment() };
}
