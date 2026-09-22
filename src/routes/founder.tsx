// Founder invite link: /founder?code=XXXX stores the promo code for later and
// sends the visitor straight into sign-up. If this route is reached from the
// marketing domain, redirect to the app origin first so the code is always
// stored on the app.
import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { storePromoCode, validatePromoCode } from "@/lib/promo-codes";
import { canonicalHead } from "@/lib/site";

const APP_ORIGIN = "https://app.askchai.tech";

export const Route = createFileRoute("/founder")({
  validateSearch: (search: Record<string, unknown>): { code?: string } =>
    typeof search.code === "string" ? { code: search.code } : {},
  head: () => ({
    meta: [
      { title: "Founder Plan invite — ChAi" },
      {
        name: "description",
        content:
          "Redeem your ChAi Founder Plan invite: the Standard plan with 1,500 customers and 5 seats for $99/mo.",
      },
      { property: "og:title", content: "ChAi Founder Plan invite" },
      { property: "og:description", content: "Standard at $99/mo with your Founder invite." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      ...canonicalHead("/founder").meta,
    ],
    links: canonicalHead("/founder").links,
  }),
  component: FounderInvite,
});

function FounderInvite() {
  const { code } = Route.useSearch();
  const navigate = useNavigate();

  useEffect(() => {
    const valid = validatePromoCode(code);
    if (valid) storePromoCode(valid);

    // If the marketing site served this page, jump to the app origin so the
    // stored promo code and subsequent sign-up happen on the right domain.
    if (typeof window !== "undefined" && window.location.origin !== APP_ORIGIN) {
      const url = new URL("/founder", APP_ORIGIN);
      if (valid) url.searchParams.set("code", valid);
      window.location.href = url.toString();
      return;
    }

    void navigate({
      to: "/auth",
      search: { mode: "signup", demo: false, redirect: undefined },
      replace: true,
    });
  }, [code, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-sm text-muted-foreground">
      Taking you to sign-up…
    </div>
  );
}
