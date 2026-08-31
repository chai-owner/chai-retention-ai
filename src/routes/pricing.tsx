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

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — ChAi | Simple pricing, powerful retention" },
      {
        name: "description",
        content:
          "One simple ChAi plan: $99/month or $999/year. AI churn prediction, health scores, insights and native integrations — with an ROI calculator to size your savings.",
      },
      { property: "og:title", content: "ChAi Pricing — Simple pricing. Powerful customer retention." },
      {
        property: "og:description",
        content: "One plan, everything included. $99/month or $999/year (save 16%).",
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

const featureList = [
  "Personalized Customer Health Scores",
  "AI Insights that update as your data changes",
  "AI-powered churn prediction",
  "ChAi AI assistant included",
  "Recommended Actions",
  "Customer Timeline",
  "Reports & Analytics",
  "Native integrations + CSV uploads",
  "Email support",
  "Secure cloud infrastructure",
  "Automatic feature updates",
  "Forget-a-customer anonymization",
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
    a: "Absolutely. You can move from monthly to annual at any time and we'll prorate what you've already paid toward the annual price.",
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
  const [annual, setAnnual] = useState(true);
  const { open: demoOpen, openGate, closeGate } = useDemoGate();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="landing min-h-screen scroll-smooth font-sans antialiased">
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
              One plan. Everything included.
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
                  Save 16%
                </span>
              </button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Section 2: Pricing card ─────────────────────── */}
      <section id="pricing" className="relative -mt-28 pb-24 lg:-mt-32 lg:pb-[7.5rem]">
        <div className="mx-auto max-w-[1280px] px-6 lg:px-8">
          <Reveal className="mx-auto max-w-[42rem]">
            <div className="group relative rounded-[20px] bg-card p-8 shadow-card ring-1 ring-border/70 transition-all duration-300 hover:-translate-y-2 hover:shadow-lift sm:p-10">
              {annual && (
                <div className="flex justify-center">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-[color:var(--accent-foreground)]">
                    <Sparkles className="h-3.5 w-3.5 text-[color:var(--gold)]" />
                    Most Popular
                  </span>
                </div>
              )}

              <div className="mt-6 text-center">
                <h2 className="text-2xl font-semibold tracking-tight">ChAi</h2>

                <div key={annual ? "y" : "m"} className="mt-6 animate-[fade-in_0.35s_ease-out]">
                  <div className="flex items-end justify-center gap-2">
                    <span className="text-6xl font-semibold tracking-[-0.04em] sm:text-7xl">
                      {annual ? "$999" : "$99"}
                    </span>
                    <span className="pb-2 text-lg font-medium text-muted-foreground">
                      {annual ? "/year" : "/month"}
                    </span>
                  </div>
                  {annual && (
                    <>
                      <p className="mt-4 text-sm font-semibold text-primary">Save 16%</p>
                      <p className="mt-1 text-sm text-muted-foreground">(Equivalent to 2 months free)</p>
                    </>
                  )}
                </div>

                <div className="mt-8 flex flex-col items-center gap-3">
                  <Link
                    to="/auth"
                    search={signup}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-7 py-4 text-base font-semibold text-primary-foreground shadow-[0_16px_40px_-16px_rgba(32,70,84,1)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[color:var(--primary-hover)]"
                  >
                    Start your 2-week free trial now <ArrowRight className="h-4.5 w-4.5" />
                  </Link>
                </div>
              </div>

              <div className="mt-10 border-t border-border pt-8">
                <ul className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                  {featureList.map((f) => (
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
            <p className="hidden sm:block">Built for modern SaaS teams.</p>
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
    const cost = annual ? 999 / 12 : 99;
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
