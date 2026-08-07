import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Sparkles,
  ArrowRight,
  PlayCircle,
  HeartPulse,
  AlertTriangle,
  Lightbulb,
  ShieldCheck,
  BarChart3,
  History,
  Plug,
  Brain,
  Rocket,
  Check,
  Linkedin,
  Twitter,
  Github,
} from "lucide-react";

import { Reveal } from "@/components/landing/reveal";
import { DemoGateDialog, useDemoGate } from "@/components/landing/demo-gate";
import {
  ZendeskIcon, ZendeskColor, IntercomIcon, IntercomColor,
  FreshdeskIcon, FreshdeskColor, HubSpotIcon, HubSpotColor,
  SalesforceIcon, SalesforceColor, ZohoIcon, ZohoColor,
  QuickBooksIcon, QuickBooksColor, FreshBooksIcon, FreshBooksColor,
  XeroIcon, XeroColor,
} from "@/components/landing/brand-icons";

const customersShot = "/screenshots/customers.png";
const insightsShot = "/screenshots/insights.png";
const plannerShot = "/screenshots/planner.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ChAi — Know who's about to leave, before they do" },
      {
        name: "description",
        content:
          "ChAi is an AI retention analyst that scores customer health, predicts churn, explains why customers leave and recommends what to do next — in plain English.",
      },
      { property: "og:title", content: "ChAi — Your AI Customer Retention Analyst" },
      {
        property: "og:description",
        content: "Understand customer health, spot churn risk, and keep more revenue.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const signup = { mode: "signup" as const, demo: false, redirect: undefined };
const login = { mode: undefined, demo: false, redirect: undefined };

const navItems = [
  { label: "Product", href: "#product" },
  { label: "Integrations", href: "#integrations" },
  { label: "Pricing", href: "/pricing" },
];

const trust = [
  { icon: Brain, title: "AI-powered insights", desc: "Root causes and next steps written in plain English, not dashboards to decode." },
  { icon: ShieldCheck, title: "Secure integrations", desc: "GDPR-first data handling with encrypted, per-workspace connections." },
  { icon: Rocket, title: "Built for modern teams", desc: "Live in minutes — no analytics team, no data warehouse required." },
  { icon: Lightbulb, title: "Actionable recommendations", desc: "Every insight is ranked by the revenue it can realistically save." },
];

const integrations = [
  { name: "Zendesk", Icon: ZendeskIcon, color: ZendeskColor },
  { name: "Intercom", Icon: IntercomIcon, color: IntercomColor },
  { name: "Freshdesk", Icon: FreshdeskIcon, color: FreshdeskColor },
  { name: "HubSpot", Icon: HubSpotIcon, color: HubSpotColor },
  { name: "Salesforce", Icon: SalesforceIcon, color: SalesforceColor },
  { name: "Zoho CRM", Icon: ZohoIcon, color: ZohoColor },
  { name: "QuickBooks Online", Icon: QuickBooksIcon, color: QuickBooksColor },
  { name: "FreshBooks", Icon: FreshBooksIcon, color: FreshBooksColor },
  { name: "Xero", Icon: XeroIcon, color: XeroColor },
];


const steps = [
  { n: "01", icon: Plug, title: "Connect your tools", desc: "Bring in CRM, billing, support and spreadsheets. ChAi maps the fields and checks quality for you." },
  { n: "02", icon: Brain, title: "ChAi analyses behaviour", desc: "It learns your industry, picks the metrics that matter and scores every customer continuously." },
  { n: "03", icon: Rocket, title: "Act before customers churn", desc: "Get a prioritised list of who to contact today and exactly what to say." },
];

const features = [
  { icon: AlertTriangle, title: "Predict churn", desc: "See who is likely to leave next month and how much revenue is on the line." },
  { icon: Sparkles, title: "AI insights", desc: "Plain-English explanations of what changed and why it matters." },
  { icon: Lightbulb, title: "Recommended actions", desc: "Prioritised next steps ranked by expected revenue saved." },
  { icon: HeartPulse, title: "Customer health scores", desc: "A 0–100 score blending usage, spend, support and sentiment." },
  { icon: BarChart3, title: "Reports & analytics", desc: "Executive-ready views of retention, risk and benchmark performance." },
  { icon: History, title: "Customer timeline", desc: "Every signal, ticket and transaction in one chronological story." },
];

const showcase = [
  {
    img: customersShot,
    w: 1888,
    h: 1908,
    eyebrow: "Customer health dashboard",
    title: "See exactly why a customer is leaving",
    desc: "Open any account for its churn probability, the precise drivers behind the risk and the actions worth taking first.",
    points: ["Root-cause risk breakdown", "Per-customer health & churn scores", "Actions ranked by $ saved"],
  },
  {
    img: insightsShot,
    w: 1888,
    h: 2488,
    eyebrow: "AI recommendations",
    title: "Recommendations ranked by revenue saved",
    desc: "ChAi turns raw data into prioritised actions and shows how your retention compares to similar businesses.",
    points: ["Actions ranked by $ impact", "Plain-English root causes", "Industry benchmarking"],
  },
  {
    img: plannerShot,
    w: 1888,
    h: 2128,
    eyebrow: "Reports & risk timeline",
    title: "Learn what to measure — and why",
    desc: "For every metric, see why it matters, how it predicts churn and where you stand. Accuracy improves as you track more.",
    points: ["Guided metric coaching", "Healthy benchmarks per metric", "Accuracy that grows with you"],
  },
];

function Landing() {
  const [scrolled, setScrolled] = useState(false);
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
        <nav className="mx-auto flex h-20 max-w-[1280px] items-center justify-start px-6 lg:px-8">
          <a href="#top" className="flex items-center gap-2.5">
            <img src="/logo-light.png" alt="ChAi" className="h-[2.925rem] w-auto" />
          </a>

          <div className="hidden items-center gap-1 md:flex ml-8">
            {navItems.map((n) => (
              <a
                key={n.label}
                href={n.href}
                className="rounded-full px-4 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                {n.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2 sm:gap-3 ml-auto">
            <Link
              to="/auth"
              search={login}
              className="hidden rounded-full px-4 py-2 text-sm font-medium text-white/75 transition-colors hover:bg-white/10 hover:text-white sm:inline-flex"
            >
              Log in
            </Link>
            <button
              onClick={openGate}
              className="hidden rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white sm:inline-flex"
            >
              View Demo
            </button>
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

      {/* ── Hero ────────────────────────────────────────── */}
      <section id="top" className="relative overflow-hidden bg-navy pt-36 pb-28 lg:pt-44 lg:pb-36">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="mesh-drift absolute -right-40 -top-52 h-[38rem] w-[38rem] rounded-full bg-primary/25 blur-[120px]" />
          <div className="mesh-drift absolute -bottom-56 -left-40 h-[34rem] w-[34rem] rounded-full bg-[#204654]/30 blur-[130px]" />
          <div className="absolute left-1/3 top-1/4 h-72 w-72 rounded-full bg-gold/10 blur-[110px]" />
          <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_70%_0%,rgba(169,224,241,0.18),transparent_60%)]" />
        </div>

        <div className="relative mx-auto grid max-w-[1280px] items-center gap-16 px-6 lg:grid-cols-[1fr_1.05fr] lg:px-8">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white/80 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-gold" />
              AI retention analyst, on demand
            </span>
            <h1 className="mt-7 text-[2.75rem] font-semibold leading-[1.05] tracking-[-0.03em] text-white sm:text-6xl lg:text-[4.25rem]">
              Know who's about to leave.
              <span className="block text-white/55">Before they do.</span>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-white/65">
              ChAi learns how your business operates, picks the metrics that actually matter for your
              industry, predicts who's about to churn, explains why, and tells you what to do — all in
              plain English.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/auth"
                search={signup}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-7 py-4 text-base font-semibold text-primary-foreground shadow-[0_16px_40px_-16px_rgba(32,70,84,1)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[color:var(--primary-hover)]"
              >
                Sign Up <ArrowRight className="h-4.5 w-4.5" />
              </Link>
              <button
                onClick={openGate}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/5 px-7 py-4 text-base font-semibold text-white backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/10"
              >
                <PlayCircle className="h-5 w-5" /> View Demo
              </button>
            </div>
            <p className="mt-5 text-sm text-white/45">
              Set up your retention engine in minutes — no analytics team required.
            </p>
          </Reveal>

          <Reveal delay={120} className="perspective-hero">
            <div className="float-slow">
              <div className="tilt-hero overflow-hidden rounded-[22px] ring-1 ring-white/10 shadow-[0_40px_90px_-30px_rgba(2,8,23,0.65)]">
                <img
                  src="/screenshots/hero-dashboard.png"
                  alt="ChAi retention dashboard showing customer health, revenue at risk and revenue by segment"
                  width={1560}
                  height={1057}
                  className="block w-full"
                />
              </div>
            </div>
          </Reveal>

        </div>
      </section>

      {/* ── Trust ───────────────────────────────────────── */}
      <section className="mx-auto max-w-[1280px] px-6 py-24 lg:px-8 lg:py-[7.5rem]">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Enterprise-grade retention intelligence
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Built to be trusted with your customer data from day one.
          </p>
        </Reveal>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {trust.map((t, i) => (
            <Reveal key={t.title} delay={i * 80}>
              <div className="group h-full rounded-[20px] bg-card p-8 shadow-soft transition-all duration-300 hover:-translate-y-1.5 hover:shadow-card">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-110">
                  <t.icon className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <h3 className="mt-5 font-semibold">{t.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Customer detail screenshot */}
        <Reveal delay={200} className="mt-16 lg:mt-24">
          <div className="mx-auto max-w-5xl">
            <div className="overflow-hidden rounded-[22px] ring-1 ring-navy/20 shadow-[0_12px_40px_-12px_rgba(21,34,56,0.45)]">
              <img
                src="/screenshots/customer-detail.png"
                alt="ChAi customer detail view showing health score, churn probability, risk drivers and recommended actions"
                width={1587}
                height={896}
                className="block w-full"
              />
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Integrations ────────────────────────────────── */}
      <section id="integrations" className="bg-card py-24 lg:py-[7.5rem]">
        <div className="mx-auto max-w-[1280px] px-6 lg:px-8">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Connect your existing tools</h2>
            <p className="mt-4 text-lg text-muted-foreground">
              ChAi works with the systems you already run on — CRM, billing, support and productivity.
              No migration, no rebuild.
            </p>
          </Reveal>
          <div className="mt-14 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-3">
            {integrations.map((it, i) => (
              <Reveal key={it.name} delay={(i % 3) * 70}>
                <div className="group flex h-full items-center gap-4 rounded-[20px] border border-border/70 bg-card p-6 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-card">
                  <span
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-secondary transition-transform duration-300 group-hover:scale-110"
                    style={{ color: it.color }}
                  >
                    <it.Icon className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="font-semibold">{it.name}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────── */}
      <section className="mx-auto max-w-[1280px] px-6 py-24 lg:px-8 lg:py-[7.5rem]">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">How it works</h2>
          <p className="mt-4 text-lg text-muted-foreground">Three steps from raw data to retained revenue.</p>
        </Reveal>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <Reveal key={s.n} delay={i * 100}>
              <div className="group h-full rounded-[20px] bg-card p-10 shadow-soft transition-all duration-300 hover:-translate-y-1.5 hover:shadow-card">
                <div className="flex items-center justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-110">
                    <s.icon className="h-5 w-5" strokeWidth={1.75} />
                  </span>
                  <span className="text-3xl font-semibold tracking-tight text-border">{s.n}</span>
                </div>
                <h3 className="mt-6 text-xl font-semibold">{s.title}</h3>
                <p className="mt-3 leading-relaxed text-muted-foreground">{s.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Features ────────────────────────────────────── */}
      <section id="features" className="bg-card py-24 lg:py-[7.5rem]">
        <div className="mx-auto max-w-[1280px] px-6 lg:px-8">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Everything you need to stop churn</h2>
            <p className="mt-4 text-lg text-muted-foreground">
              From knowing what to measure to knowing exactly who to call today.
            </p>
          </Reveal>
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 80}>
                <div className="group h-full rounded-[20px] bg-card p-10 shadow-soft ring-1 ring-border/60 transition-all duration-300 hover:-translate-y-1.5 hover:ring-primary/25 hover:shadow-card">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-110">
                    <f.icon className="h-5 w-5" strokeWidth={1.75} />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
                  <p className="mt-2 leading-relaxed text-muted-foreground">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Product showcase ────────────────────────────── */}
      <section id="product" className="mx-auto max-w-[1280px] px-6 py-24 lg:px-8 lg:py-[7.5rem]">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">See it in action</h2>
          <p className="mt-4 text-lg text-muted-foreground">
            A calm, focused workspace that turns raw data into retention intelligence.
          </p>
        </Reveal>

        <div className="mt-20 space-y-24 lg:space-y-32">
          {showcase.map((s, i) => (
            <Reveal key={s.title}>
              <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
                <div className={i % 2 === 1 ? "lg:order-2" : ""}>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{s.eyebrow}</p>
                  <h3 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{s.title}</h3>
                  <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{s.desc}</p>
                  <ul className="mt-7 space-y-3">
                    {s.points.map((p) => (
                      <li key={p} className="flex items-center gap-3 text-[15px]">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={i % 2 === 1 ? "lg:order-1" : ""}>
                  <div className="overflow-hidden rounded-[22px] shadow-[0_20px_60px_-18px_rgba(21,34,56,0.55)] transition-transform duration-500 hover:-translate-y-2">
                    <div className="-mt-px">
                      <img
                        src={s.img}
                        alt={`${s.eyebrow} — ${s.title}`}
                        width={s.w}
                        height={s.h}
                        className="block h-auto w-full"
                        loading="lazy"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────── */}
      <section id="pricing" className="mx-auto max-w-[1280px] px-6 pb-24 lg:px-8 lg:pb-[7.5rem]">
        <Reveal>
          <div className="relative overflow-hidden rounded-[24px] bg-navy px-8 py-20 text-center shadow-lift lg:px-16">
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <div className="mesh-drift absolute -right-24 -top-24 h-96 w-96 rounded-full bg-primary/35 blur-[110px]" />
              <div className="absolute -bottom-28 -left-20 h-96 w-96 rounded-full bg-[#204654]/30 blur-[120px]" />
            </div>
            <div className="relative">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white/80 backdrop-blur">
                <Sparkles className="h-3.5 w-3.5 text-gold" /> Start today
              </span>
              <h2 className="mx-auto mt-6 max-w-2xl text-4xl font-semibold tracking-[-0.03em] text-white sm:text-5xl">
                Ready to reduce churn?
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-lg text-white/65">
                Bring your data and let ChAi surface who's at risk and what to do next — in plain English.
              </p>
              <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  to="/auth"
                  search={signup}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-7 py-4 text-base font-semibold text-primary-foreground shadow-[0_16px_40px_-16px_rgba(32,70,84,1)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[color:var(--primary-hover)]"
                >
                  Sign Up <ArrowRight className="h-4.5 w-4.5" />
                </Link>
                <button
                  onClick={openGate}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/5 px-7 py-4 text-base font-semibold text-white backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/10"
                >
                  View Demo
                </button>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Footer ──────────────────────────────────────── */}
      <footer className="border-t border-border bg-card">
        <div className="mx-auto max-w-[1280px] px-6 py-16 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr_1fr_1.4fr]">
            <div>
              <div className="flex items-center gap-2.5">
                <img src="/logo-dark.png" alt="ChAi" className="h-9 w-auto" />
              </div>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
                Customer intelligence and retention, in plain English.
              </p>
              <div className="mt-6 flex items-center gap-2">
                {[Linkedin, Twitter, Github].map((Icon, i) => (
                  <a
                    key={i}
                    href="#top"
                    aria-label="Social link"
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-muted-foreground transition-all duration-200 hover:-translate-y-0.5 hover:text-primary"
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold">Product</p>
              <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                <li><a className="transition-colors hover:text-primary" href="#product">Overview</a></li>
                <li><a className="transition-colors hover:text-primary" href="#features">Features</a></li>
                <li><a className="transition-colors hover:text-primary" href="#integrations">Integrations</a></li>
                <li><Link className="transition-colors hover:text-primary" to="/pricing">Pricing</Link></li>
              </ul>
            </div>

            <div>
              <p className="text-sm font-semibold">Resources</p>
              <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                <li>
                  <button className="transition-colors hover:text-primary" onClick={openGate}>
                    Live demo
                  </button>
                </li>
                <li><a className="transition-colors hover:text-primary" href="#top">Privacy Policy</a></li>
                <li><a className="transition-colors hover:text-primary" href="#top">Terms</a></li>
                <li>
                  <Link className="transition-colors hover:text-primary" to="/auth" search={login}>
                    Log in
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <p className="text-sm font-semibold">Stay in the loop</p>
              <p className="mt-4 text-sm text-muted-foreground">
                Occasional notes on retention, churn and AI. No spam.
              </p>
              <form
                className="mt-5 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.blur();
                }}
              >
                <label htmlFor="newsletter" className="sr-only">Email address</label>
                <input
                  id="newsletter"
                  type="email"
                  required
                  placeholder="you@company.com"
                  className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary"
                />
                <button
                  type="submit"
                  className="shrink-0 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-[color:var(--primary-hover)]"
                >
                  Subscribe
                </button>
              </form>
              <Link
                to="/auth"
                search={signup}
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
              >
                Create an account <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          <div className="mt-14 flex flex-col items-center justify-between gap-3 border-t border-border pt-8 text-sm text-muted-foreground sm:flex-row">
            <p>© {new Date().getFullYear()} ChAi. All rights reserved.</p>
            <p className="hidden sm:block">Built for modern SaaS teams.</p>
          </div>
        </div>
      </footer>

      <DemoGateDialog open={demoOpen} onClose={closeGate} />
    </div>
  );
}
