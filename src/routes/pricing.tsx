import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Sparkles,
  ArrowRight,
  Check,
  ChevronDown,
  Users,
  DollarSign,
  TrendingDown,
} from "lucide-react";

import { Reveal } from "@/components/landing/reveal";
import { DemoGateDialog, useDemoGate } from "@/components/landing/demo-gate";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import {
  PLAN_LABELS,
  PLAN_PRICING,
  annualSaving,
  type BillingPeriod,
  type OrgPlan,
} from "@/lib/organisations";
import { useSignedIn, useAuthUserId } from "@/lib/use-auth-state";
import { usePaddleCheckout } from "@/hooks/use-paddle-checkout";
import { supabase } from "@/integrations/supabase/client";
import { PromoCodeField } from "@/components/promo-code-field";
import { FOUNDER_MONTHLY_PRICE, FOUNDER_PLAN, readStoredPromoCode } from "@/lib/promo-codes";

type PricingSearch = { plan?: OrgPlan; period?: "monthly" | "annual"; addon?: true };

export const Route = createFileRoute("/pricing")({
  validateSearch: (search: Record<string, unknown>): PricingSearch => ({
    ...(search.plan === "core" || search.plan === "standard" || search.plan === "enterprise"
      ? { plan: search.plan as OrgPlan }
      : {}),
    ...(search.period === "annual"
      ? { period: "annual" as const }
      : search.period === "monthly"
        ? { period: "monthly" as const }
        : {}),
    ...(search.addon === "1" || search.addon === "true" ? { addon: true as const } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Pricing — ChAi | Core, Standard & Enterprise plans" },
      {
        name: "description",
        content:
          "ChAi pricing: Core $99/mo, Standard $249/mo and Enterprise $599/mo — save 10% with annual billing. AI churn prediction, health scores and native integrations.",
      },
      { property: "og:title", content: "ChAi Pricing — Core, Standard and Enterprise" },
      {
        property: "og:description",
        content: "Three plans from $99/month. Save 10% when you pay annually.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PricingPage,
});

const signup = { mode: "signup" as const, demo: false, redirect: undefined };
const login = { mode: undefined, demo: false, redirect: undefined };

const navItems = [
  { label: "Features", href: "/#features" },
  { label: "Integrations", href: "/#integrations" },
];

const sharedFeatures = [
  "Personalized Customer Health Scores",
  "AI churn prediction & insights",
  "ChAi AI assistant included",
  "Recommended actions & customer timeline",
  "Native integrations + CSV uploads",
  "Guided onboarding and email support",
];

const tiers: Array<{
  plan: OrgPlan;
  tagline: string;
  highlight?: boolean;
  features: string[];
}> = [
  {
    plan: "core",
    tagline: "For small teams getting their retention basics in place.",
    features: [
      "Up to 250 customers",
      "1 user seat",
      "ChAi Data Drop as a $39/mo add-on",
      ...sharedFeatures,
    ],
  },
  {
    plan: "standard",
    tagline: "For growing teams that need more customers and more seats.",
    highlight: true,
    features: [
      "Up to 1,500 customers",
      "5 user seats",
      "ChAi Data Drop included",
      ...sharedFeatures,
    ],
  },
  {
    plan: "enterprise",
    tagline: "For established teams with no limits on scale.",
    features: [
      "Unlimited customers",
      "Unlimited user seats",
      "ChAi Data Drop included",
      ...sharedFeatures,
    ],
  },
];


const builtFor = [
  "SaaS companies",
  "Subscription businesses",
  "Membership platforms",
  "Agencies",
  "Online education",
  "B2B software",
  "Growing businesses",
];

const faqs = [
  {
    q: "Can I cancel anytime?",
    a: "Yes. There are no lock-in contracts. Cancel whenever you like and you'll keep access until the end of your current billing period.",
  },
  {
    q: "Do I need technical knowledge?",
    a: "No. ChAi is built for business teams. You connect your tools or drop in a spreadsheet, and ChAi maps the fields, checks quality and explains everything in plain English.",
  },
  {
    q: "Which integrations do you support?",
    a: "Zendesk, Intercom, Freshdesk, HubSpot, Salesforce, Zoho CRM, QuickBooks Online, FreshBooks and Xero — plus CSV and spreadsheet uploads for anything else.",
  },
  {
    q: "How long does setup take?",
    a: "Most teams are live in under 30 minutes. Connect a source, answer a few questions about your business, and ChAi starts scoring your customers immediately.",
  },
  {
    q: "How secure is my customer data?",
    a: "Data is encrypted in transit and at rest, and isolated per workspace. Integration credentials are encrypted, and you can anonymise or erase any customer on request.",
  },
  {
    q: "Do you offer onboarding?",
    a: "Yes. Every plan includes guided onboarding that walks you through connecting data, choosing the metrics that matter for your industry and reading your first insights.",
  },
  {
    q: "Can I switch to annual later?",
    a: "Absolutely. You can move from monthly to annual at any time and save 10%. We'll prorate what you've already paid toward the annual price.",
  },
  {
    q: "Will ChAi work with my existing tools?",
    a: "Yes. ChAi sits on top of the systems you already run on — there's no migration and nothing to rebuild. If a source isn't natively supported, upload it and ChAi will handle the rest.",
  },
];

/** Smoothly animates a number toward its target value. */
function useAnimatedNumber(value: number, duration = 500) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (value - from) * eased;
      setDisplay(next);
      fromRef.current = next;
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return display;
}

const money = (n: number) =>
  `$${Math.round(n).toLocaleString("en-US")}`;

function PricingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [annual, setAnnual] = useState(false);
  const { open: demoOpen, openGate, closeGate } = useDemoGate();
  const [addonChecked, setAddonChecked] = useState(false);
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [initialPromo, setInitialPromo] = useState<string | null>(null);
  const signedIn = useSignedIn();
  const userId = useAuthUserId();
  const { openCheckout, loading: checkoutLoading } = usePaddleCheckout();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const autoOpenedRef = useRef(false);

  // A Founder invite stored a code before sign-up: pre-fill and apply it.
  useEffect(() => {
    setInitialPromo(readStoredPromoCode());
  }, []);

  const buy = async (plan: OrgPlan, period: BillingPeriod, includeAddon: boolean) => {
    if (!signedIn || !userId) {
      // Send them through sign-up/sign-in first; the query string below brings
      // them straight back here and auto-opens checkout.
      navigate({
        to: "/auth",
        search: {
          mode: "signup",
          demo: false,
          redirect: `/pricing?plan=${plan}&period=${period}${includeAddon ? "&addon=1" : ""}`,
        },
      });
      return;
    }
    const { data } = await supabase.auth.getSession();
    await openCheckout({
      plan,
      period,
      includeAddon,
      userId,
      customerEmail: data.session?.user.email ?? undefined,
      discountCode: plan === FOUNDER_PLAN ? promoCode : null,
    });
  };


  // Returning from auth with a pending purchase: open checkout automatically.
  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (!signedIn || !userId || !search.plan || !search.period) return;
    autoOpenedRef.current = true;
    const plan = search.plan;
    const period = search.period;
    const addon = !!search.addon;
    navigate({ to: "/pricing", search: {}, replace: true });
    void buy(plan, period, addon);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, userId, search.plan, search.period, search.addon]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="landing min-h-screen scroll-smooth font-sans antialiased">
      <PaymentTestModeBanner />
      {/* ── Nav ─────────────────────────────────────────── */}
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          scrolled ? "border-b border-white/10 bg-navy/70 backdrop-blur-xl" : "border-b border-transparent"
        }`}
      >
        <nav className="mx-auto flex h-20 max-w-[1280px] items-center justify-between px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/logo-light.png" alt="ChAi" className="h-9 w-auto" />
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            {navItems.map((n) => (
              <a
                key={n.label}
                href={n.href}
                className="rounded-full px-4 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                {n.label}
              </a>
            ))}
            <Link
              to="/pricing"
              className="rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors"
            >
              Pricing
            </Link>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={openGate}
              className="hidden rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white sm:inline-flex"
            >
              View Demo
            </button>
            <Link
              to="/auth"
              search={login}
              className="hidden rounded-full px-4 py-2 text-sm font-medium text-white/75 transition-colors hover:bg-white/10 hover:text-white sm:inline-flex"
            >
              Log in
            </Link>
            <Link
              to="/auth"
              search={signup}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_8px_24px_-8px_rgba(32,70,84,0.9)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[color:var(--primary-hover)]"
            >
              Sign Up
            </Link>
          </div>
        </nav>
      </header>

      {/* ── Section 1: Hero ─────────────────────────────── */}
      <section className="relative overflow-hidden bg-navy pt-36 pb-40 lg:pt-44 lg:pb-52">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="mesh-drift absolute -right-40 -top-52 h-[38rem] w-[38rem] rounded-full bg-primary/25 blur-[120px]" />
          <div className="mesh-drift absolute -bottom-56 -left-40 h-[34rem] w-[34rem] rounded-full bg-[#204654]/30 blur-[130px]" />
          <div className="absolute left-1/2 top-1/4 h-72 w-72 -translate-x-1/2 rounded-full bg-gold/10 blur-[110px]" />
        </div>

        <div className="relative mx-auto max-w-[1280px] px-6 text-center lg:px-8">
          <Reveal className="mx-auto max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white/80 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-gold" />
              Three plans. Everything included.
            </span>
            <h1 className="mt-7 text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.03em] text-white sm:text-6xl lg:text-[4rem]">
              Simple pricing.
              <span className="block text-white/55">Powerful customer retention.</span>
            </h1>
            <p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-white/65">
              Everything you need to identify at-risk customers, understand why they're leaving and
              take action before they churn.
            </p>
          </Reveal>

          {/* Billing toggle */}
          <Reveal delay={100}>
            <div className="mt-12 inline-flex items-center rounded-full border border-white/15 bg-white/5 p-1.5 backdrop-blur">
              <button
                onClick={() => setAnnual(false)}
                aria-pressed={!annual}
                className={`rounded-full px-6 py-2.5 text-sm font-semibold transition-all duration-300 ${
                  !annual ? "bg-white text-navy shadow-[0_8px_24px_-10px_rgba(0,0,0,0.6)]" : "text-white/70 hover:text-white"
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setAnnual(true)}
                aria-pressed={annual}
                className={`flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold transition-all duration-300 ${
                  annual ? "bg-white text-navy shadow-[0_8px_24px_-10px_rgba(0,0,0,0.6)]" : "text-white/70 hover:text-white"
                }`}
              >
                Annual
                <span
                  className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold transition-colors duration-300 ${
                    annual ? "bg-gold/20 text-[color:var(--gold)]" : "bg-white/10 text-white/70"
                  }`}
                >
                  Save 10%
                </span>
              </button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Section 2: Pricing tiers ────────────────────── */}
      <section id="pricing" className="relative -mt-28 pb-24 lg:-mt-32 lg:pb-[7.5rem]">
        <div className="mx-auto max-w-[1280px] px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-3">
            {tiers.map((tier, i) => {
              const price = PLAN_PRICING[tier.plan];
              const founder = !!promoCode && tier.plan === FOUNDER_PLAN && !annual;
              return (
                <Reveal key={tier.plan} delay={i * 90}>
                  <div
                    className={`group relative flex h-full flex-col rounded-[20px] bg-card p-8 shadow-card transition-all duration-300 hover:-translate-y-2 hover:shadow-lift ${
                      tier.highlight ? "ring-2 ring-primary" : "ring-1 ring-border/70"
                    }`}
                  >
                    {founder ? (
                      <div className="flex justify-center">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-success">
                          <Sparkles className="h-3.5 w-3.5" />
                          Founder Plan
                        </span>
                      </div>
                    ) : tier.highlight ? (
                      <div className="flex justify-center">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-[color:var(--accent-foreground)]">
                          <Sparkles className="h-3.5 w-3.5 text-[color:var(--gold)]" />
                          Most Popular
                        </span>
                      </div>
                    ) : null}

                    <div className="mt-4 text-center">
                      <h2 className="text-2xl font-semibold tracking-tight">
                        {PLAN_LABELS[tier.plan]}
                      </h2>
                      <p className="mt-2 text-sm text-muted-foreground">{tier.tagline}</p>

                      <div key={annual ? "y" : "m"} className="mt-6 animate-[fade-in_0.35s_ease-out]">
                        <div className="flex items-end justify-center gap-2">
                          {founder ? (
                            <span className="pb-2 text-2xl font-medium text-muted-foreground line-through">
                              {money(price.monthly)}
                            </span>
                          ) : null}
                          <span className="text-5xl font-semibold tracking-[-0.04em]">
                            {money(
                              founder
                                ? FOUNDER_MONTHLY_PRICE
                                : annual
                                  ? price.annualMonthly
                                  : price.monthly,
                            )}
                          </span>
                          <span className="pb-2 text-base font-medium text-muted-foreground">/mo</span>
                        </div>
                        {annual ? (
                          <>
                            <p className="mt-2 text-sm text-muted-foreground">billed annually</p>
                            <p className="mt-1 text-sm font-semibold text-primary">
                              {money(price.annualTotal)} per year · save{" "}
                              {money(annualSaving(tier.plan))}
                            </p>
                          </>
                        ) : (
                          <p className="mt-2 text-sm text-muted-foreground">billed monthly</p>
                        )}
                      </div>


                      <button
                        type="button"
                        disabled={checkoutLoading}
                        onClick={() => void buy(tier.plan, annual ? "annual" : "monthly", addonChecked)}
                        className={`mt-7 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-base font-semibold transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-60 ${
                          tier.highlight
                            ? "bg-primary text-primary-foreground shadow-[0_16px_40px_-16px_rgba(32,70,84,1)] hover:bg-[color:var(--primary-hover)]"
                            : "border border-border bg-background hover:border-primary/40"
                        }`}
                      >
                        {checkoutLoading ? "Opening checkout…" : "Get started"} <ArrowRight className="h-4 w-4" />
                      </button>
                      {tier.plan === "core" && !annual && (
                        <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 text-sm text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={addonChecked}
                            onChange={(e) => setAddonChecked(e.target.checked)}
                            className="h-4 w-4 rounded border-border accent-[color:var(--primary)]"
                          />
                          Add ChAi Data Drop (+$39/mo)
                        </label>
                      )}
                    </div>

                    <div className="mt-8 border-t border-border pt-6">
                      <ul className="grid gap-3">
                        {tier.features.map((f) => (
                          <li key={f} className="flex items-start gap-3">
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                              <Check className="h-3 w-3" strokeWidth={3} />
                            </span>
                            <span className="text-sm leading-relaxed">{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
          <PromoCodeField
            className="mt-8"
            appliedCode={promoCode}
            onApply={setPromoCode}
            initialCode={initialPromo}
          />
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Annual billing saves 10% and is charged as a single yearly payment.
          </p>
        </div>
      </section>


      {/* ── Section 3: ROI calculator ───────────────────── */}
      <RoiCalculator annual={annual} />

      {/* ── Section 4: Perfect For ──────────────────────── */}
      <section className="mx-auto max-w-[1280px] px-6 py-24 lg:px-8 lg:py-[7.5rem]">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Perfect For</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            Who ChAi is built for
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            If you have recurring customers, ChAi helps you keep more of them.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {builtFor.map((b, i) => (
            <Reveal key={b} delay={(i % 4) * 70}>
              <div className="group flex h-full items-center gap-3 rounded-[20px] border border-border/70 bg-card p-6 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-card">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-110">
                  <Check className="h-4 w-4" strokeWidth={3} />
                </span>
                <p className="font-semibold">{b}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Section 5: FAQ ──────────────────────────────── */}
      <section className="bg-card py-24 lg:py-[7.5rem]">
        <div className="mx-auto max-w-[1280px] px-6 lg:px-8">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Frequently Asked Questions
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Everything else you might want to know before getting started.
            </p>
          </Reveal>

          <div className="mx-auto mt-14 max-w-3xl space-y-3">
            {faqs.map((f, i) => (
              <Reveal key={f.q} delay={Math.min(i, 4) * 60}>
                <FaqItem q={f.q} a={f.a} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────── */}
      <footer className="border-t border-border bg-background">
        <div className="mx-auto max-w-[1280px] px-6 py-12 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-8 sm:flex-row">
            <div className="flex items-center gap-2.5">
              <img src="/logo-dark.png" alt="ChAi" className="h-9 w-auto dark:hidden" />
              <img src="/logo-light.png" alt="ChAi" className="hidden h-9 w-auto dark:block" />
            </div>

            <div className="flex flex-col items-center sm:items-end">
              <p className="text-sm font-semibold">Resources</p>
              <ul className="mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground sm:justify-end">
                <li>
                  <button className="transition-colors hover:text-primary" onClick={openGate}>
                    Live Demo
                  </button>
                </li>
                <li>
                  <Link className="transition-colors hover:text-primary" to="/terms">
                    Terms
                  </Link>
                </li>
                <li>
                  <Link className="transition-colors hover:text-primary" to="/privacy">
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link className="transition-colors hover:text-primary" to="/auth" search={login}>
                    Log in
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row">
            <p>© {new Date().getFullYear()} ChAi. All rights reserved.</p>
            <p className="hidden sm:block">Built for businesses that run on recurring revenue.</p>
          </div>
        </div>
      </footer>

      <DemoGateDialog open={demoOpen} onClose={closeGate} />
    </div>
  );
}

/* ── ROI calculator ───────────────────────────────────── */

const inputs = [
  { key: "customers", label: "Number of customers", icon: Users, min: 1, step: 10, suffix: "" },
  { key: "value", label: "Average customer value", icon: DollarSign, min: 1, step: 50, suffix: "/mo" },
  { key: "churn", label: "Current monthly churn %", icon: TrendingDown, min: 0, step: 0.5, suffix: "%" },
] as const;

function RoiCalculator({ annual }: { annual: boolean }) {
  const [customers, setCustomers] = useState(500);
  const [value, setValue] = useState(250);
  const [churn, setChurn] = useState(4);

  const state = { customers, value, churn };
  const setters = {
    customers: setCustomers,
    value: setValue,
    churn: setChurn,
  } as const;

  const { atRisk, protectedRev, roi } = useMemo(() => {
    const atRisk = customers * value * (churn / 100);
    const protectedRev = atRisk * 0.3; // conservative 30% of at-risk revenue saved
    const cost = annual ? PLAN_PRICING.core.annualMonthly : PLAN_PRICING.core.monthly;
    const roi = cost > 0 ? ((protectedRev - cost) / cost) * 100 : 0;
    return { atRisk, protectedRev, roi };
  }, [customers, value, churn, annual]);

  const aAtRisk = useAnimatedNumber(atRisk);
  const aProtected = useAnimatedNumber(protectedRev);
  const aRoi = useAnimatedNumber(roi);

  return (
    <section className="bg-card py-24 lg:py-[7.5rem]">
      <div className="mx-auto max-w-[1280px] px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl lg:text-[2.75rem]">
            See how quickly ChAi pays for itself.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Adjust the numbers below to size the revenue you could protect each month.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {inputs.map((f, i) => (
            <Reveal key={f.key} delay={i * 80}>
              <div className="h-full rounded-[20px] border border-border/70 bg-background p-8 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-card">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <label htmlFor={f.key} className="mt-5 block text-sm font-semibold">
                  {f.label}
                </label>
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 transition-colors focus-within:border-primary">
                  <input
                    id={f.key}
                    type="number"
                    min={f.min}
                    step={f.step}
                    value={state[f.key]}
                    onChange={(e) => setters[f.key](Math.max(f.min, Number(e.target.value) || 0))}
                    className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none"
                  />
                  {f.suffix ? (
                    <span className="shrink-0 text-sm text-muted-foreground">{f.suffix}</span>
                  ) : null}
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={120}>
          <div className="mt-8 rounded-[20px] bg-navy p-8 shadow-lift sm:p-10">
            <div className="grid gap-8 sm:grid-cols-3">
              <div>
                <p className="text-sm text-white/55">Estimated monthly revenue at risk</p>
                <p className="mt-3 text-4xl font-semibold tracking-[-0.03em] text-white">
                  {money(aAtRisk)}
                </p>
              </div>
              <div>
                <p className="text-sm text-white/55">Potential revenue protected</p>
                <p className="mt-3 text-4xl font-semibold tracking-[-0.03em] text-[color:var(--gold)]">
                  {money(aProtected)}
                </p>
              </div>
              <div>
                <p className="text-sm text-white/55">Estimated ROI</p>
                <p className="mt-3 text-4xl font-semibold tracking-[-0.03em] text-white">
                  {Math.round(aRoi).toLocaleString("en-US")}%
                </p>
              </div>
            </div>
          </div>
          <p className="mt-5 text-center text-sm text-muted-foreground">
            These figures are estimates based on your inputs and do not guarantee business outcomes.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ── FAQ accordion ────────────────────────────────────── */

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={`overflow-hidden rounded-[20px] border bg-background transition-all duration-300 ${
        open ? "border-primary/30 shadow-card" : "border-border/70 shadow-soft hover:border-primary/20"
      }`}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-6 px-8 py-6 text-left"
      >
        <span className="text-base font-semibold sm:text-lg">{q}</span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300 ${
            open ? "rotate-180 text-primary" : ""
          }`}
        />
      </button>
      <div
        className="grid transition-all duration-300 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }}
      >
        <div className="overflow-hidden">
          <p className="px-8 pb-6 text-base leading-relaxed text-muted-foreground">{a}</p>
        </div>
      </div>
    </div>
  );
}
