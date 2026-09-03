import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Target,
  Gauge,
  TrendingUp,
  ShieldCheck,
  Share2,
  ShieldOff,
  Plug,
  Brain,
  Rocket,
} from "lucide-react";

import { Reveal } from "@/components/landing/reveal";
import { DemoGateDialog, useDemoGate } from "@/components/landing/demo-gate";
import { HeroRiskCard, heroCustomer } from "@/components/landing/hero-risk-card";
import {
  ZendeskIcon, ZendeskColor, IntercomIcon, IntercomColor,
  FreshdeskIcon, FreshdeskColor, HubSpotIcon, HubSpotColor,
  SalesforceIcon, SalesforceColor, ZohoIcon, ZohoColor,
  QuickBooksIcon, QuickBooksColor, FreshBooksIcon, FreshBooksColor,
  XeroIcon, XeroColor,
} from "@/components/landing/brand-icons";

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
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "/pricing" },
];

const features = [
  { icon: Target, title: "Industry-specific metrics", desc: "ChAi helps you pick the metrics that actually matter for your industry and business model — no generic templates." },
  { icon: Gauge, title: "Weighted health scores", desc: "You control how much each metric contributes to a customer's 0–100 health score." },
  { icon: TrendingUp, title: "Predict churn & revenue at risk", desc: "See who's likely to leave, how much revenue is exposed, and what's realistically recoverable." },
  { icon: ShieldCheck, title: "AI insights & actions", desc: "Plain-English root causes and prioritised next steps ranked by the revenue they can save." },
  { icon: Share2, title: "Cross-platform identity resolution", desc: "Automatically link the same customer across CRM, billing and support tools — and fix duplicates." },
  { icon: ShieldOff, title: "Forget-a-customer anonymization", desc: "Honour data-erasure requests in seconds while keeping your aggregate retention intelligence intact." },
];

const scoreBands = [
  { label: "Healthy", color: "var(--success)", desc: "Engaged, paying on time and trending steady." },
  { label: "Watch", color: "var(--warning)", desc: "Early softening in usage or support signals." },
  { label: "At risk", color: "var(--caution)", desc: "Clear decline — worth a conversation this week." },
  { label: "Critical", color: "var(--danger)", desc: "Likely to leave soon without direct intervention." },
];

const steps = [
  { n: "01", icon: Plug, title: "Connect your tools", desc: "Bring in CRM, billing, support and spreadsheets. ChAi maps the fields and checks quality for you." },
  { n: "02", icon: Brain, title: "ChAi analyses behaviour", desc: "It learns your industry, picks the metrics that matter and scores every customer continuously." },
  { n: "03", icon: Rocket, title: "Act before customers churn", desc: "Get a prioritised list of who to contact today and exactly what to say." },
];

const integrations = [
  { name: "Zendesk", Icon: ZendeskIcon, color: ZendeskColor, category: "Support" },
  { name: "Intercom", Icon: IntercomIcon, color: IntercomColor, category: "Support" },
  { name: "Freshdesk", Icon: FreshdeskIcon, color: FreshdeskColor, category: "Support" },
  { name: "HubSpot", Icon: HubSpotIcon, color: HubSpotColor, category: "CRM" },
  { name: "Salesforce", Icon: SalesforceIcon, color: SalesforceColor, category: "CRM" },
  { name: "Zoho CRM", Icon: ZohoIcon, color: ZohoColor, category: "CRM" },
  { name: "QuickBooks Online", Icon: QuickBooksIcon, color: QuickBooksColor, category: "Billing" },
  { name: "FreshBooks", Icon: FreshBooksIcon, color: FreshBooksColor, category: "Billing" },
  { name: "Xero", Icon: XeroIcon, color: XeroColor, category: "Billing" },
];

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C3FFA5] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-[8px] bg-[#A9E0F1]/50 px-3 py-1 text-xs font-semibold text-[#204654]">
      {children}
    </span>
  );
}

function Landing() {
  const { open: demoOpen, openGate, closeGate } = useDemoGate();

  return (
    <div className="landing min-h-screen scroll-smooth font-sans antialiased">
      {/* ── Header + hero (dark rounded island) ─────────── */}
      <section id="top" className="rounded-b-[36px] bg-[#152238] pb-20 lg:pb-28">
        <nav className="mx-auto flex h-20 max-w-[1240px] items-center gap-6 px-6 lg:px-8">
          <a href="#top" className={`flex items-center rounded-[10px] ${focusRing}`}>
            <img src="/logo-light.png" alt="ChAi" className="h-12 w-auto" />
          </a>

          <div className="ml-auto hidden items-center gap-1 md:flex">
            {navItems.map((n) => (
              <a
                key={n.label}
                href={n.href}
                className={`rounded-[10px] px-3.5 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white ${focusRing}`}
              >
                {n.label}
              </a>
            ))}
            <Link
              to="/auth"
              search={login}
              className={`rounded-[10px] px-3.5 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white ${focusRing}`}
            >
              Log in
            </Link>
          </div>

          <Link
            to="/auth"
            search={signup}
            className={`group ml-auto inline-flex items-center gap-2 rounded-[10px] bg-[#C3FFA5] px-4 py-2.5 text-sm font-bold text-[#152238] transition-colors hover:bg-[#A8E080] md:ml-3 ${focusRing}`}
          >
            Get started
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </nav>

        <div className="mx-auto mt-10 grid max-w-[1240px] items-center gap-16 px-6 lg:mt-16 lg:grid-cols-[1fr_0.95fr] lg:px-8">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-[10px] bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white/85">
              <span className="h-1.5 w-1.5 rounded-full bg-[#C3FFA5]" />
              Customer retention intelligence
            </span>
            <h1 className="mt-6 text-[2.6rem] font-extrabold leading-[1.05] tracking-[-0.02em] text-white sm:text-5xl lg:text-[4rem]">
              See who's about to leave — and what to say to{" "}
              <span className="text-[#C3FFA5]">keep them</span>.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/65">
              ChAi reads your CRM, billing and support data, scores every customer's health and
              explains what to do next in plain English.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/auth"
                search={signup}
                className={`inline-flex items-center justify-center gap-2 rounded-[10px] bg-[#C3FFA5] px-6 py-3.5 text-base font-bold text-[#152238] transition-colors hover:bg-[#A8E080] ${focusRing}`}
              >
                Try it for free <ArrowRight className="h-4 w-4" />
              </Link>
              <button
                onClick={openGate}
                className={`inline-flex items-center justify-center gap-2 rounded-[10px] border border-white/25 px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-white/10 ${focusRing}`}
              >
                Book a demo
              </button>
            </div>
            <p className="mt-5 text-sm text-white/45">
              No credit card required · 14-day free trial · Cancel anytime
            </p>
          </Reveal>

          <Reveal delay={120}>
            <HeroRiskCard customer={heroCustomer} />
          </Reveal>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────── */}
      <section id="features" className="mx-auto max-w-[1240px] px-6 py-24 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Eyebrow>Features</Eyebrow>
          <h2 className="mt-4 text-3xl font-extrabold tracking-[-0.02em] sm:text-4xl">
            Everything you need to stop churn
          </h2>
          <p className="mt-4 text-lg text-[#4A5A6B]">
            Industry-specific metrics, weighted health scores, AI insights, identity resolution and
            privacy-safe anonymization — in one place.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 80}>
              <div className="h-full rounded-[18px] bg-white p-8">
                <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-[#204654] text-white">
                  <f.icon className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <h3 className="mt-5 text-lg font-extrabold tracking-[-0.02em]">{f.title}</h3>
                <p className="mt-2 leading-relaxed text-[#4A5A6B]">{f.desc}</p>
                <a
                  href="#scoring"
                  className={`mt-5 inline-flex items-center gap-1.5 rounded-[8px] text-sm font-bold text-[#152238] ${focusRing}`}
                >
                  Learn more <ArrowRight className="h-3.5 w-3.5" />
                </a>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── How scoring works ───────────────────────────── */}
      <section id="scoring" className="mx-auto max-w-[1240px] px-6 pb-24 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Eyebrow>How scoring works</Eyebrow>
          <h2 className="mt-4 text-3xl font-extrabold tracking-[-0.02em] sm:text-4xl">
            One consistent signal, everywhere
          </h2>
          <p className="mt-4 text-lg text-[#4A5A6B]">
            Every customer gets a 0–100 health score on the same four-stage scale — identical on this
            page and inside the app, so the colour always means the same thing.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {scoreBands.map((b, i) => (
            <Reveal key={b.label} delay={i * 70}>
              <div className="h-full rounded-[16px] bg-white p-6">
                <div className="flex items-center gap-2.5">
                  <span
                    className="h-3 w-3 rounded-[4px]"
                    style={{ backgroundColor: b.color }}
                  />
                  <p className="font-extrabold tracking-[-0.02em]">{b.label}</p>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-[#4A5A6B]">{b.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── How it works ────────────────────────────────── */}
      <section className="mx-auto max-w-[1240px] px-6 pb-24 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Eyebrow>Onboarding</Eyebrow>
          <h2 className="mt-4 text-3xl font-extrabold tracking-[-0.02em] sm:text-4xl">
            How it works
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <Reveal key={s.n} delay={i * 100}>
              <div className="h-full rounded-[18px] bg-[#DFF0F7] p-8">
                <div className="flex items-center gap-3">
                  <span className="text-3xl font-extrabold tracking-[-0.02em] text-[#204654]">
                    {s.n}
                  </span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#204654] text-white">
                    <s.icon className="h-4.5 w-4.5" strokeWidth={1.75} />
                  </span>
                </div>
                <h3 className="mt-5 text-xl font-extrabold tracking-[-0.02em]">{s.title}</h3>
                <p className="mt-2 leading-relaxed text-[#4A5A6B]">{s.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Integrations ────────────────────────────────── */}
      <section id="integrations" className="mx-auto max-w-[1240px] px-6 pb-24 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Eyebrow>Integrations</Eyebrow>
          <h2 className="mt-4 text-3xl font-extrabold tracking-[-0.02em] sm:text-4xl">
            Connect your existing tools
          </h2>
          <p className="mt-4 text-lg text-[#4A5A6B]">
            ChAi works with the systems you already run on. No migration, no rebuild.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {integrations.map((it, i) => (
            <Reveal key={it.name} delay={(i % 3) * 70}>
              <div className="flex h-full items-center gap-4 rounded-[16px] bg-white p-5">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-[#EEF7FB]"
                  style={{ color: it.color }}
                >
                  <it.Icon className="h-6 w-6" />
                </span>
                <div>
                  <p className="font-extrabold tracking-[-0.02em]">{it.name}</p>
                  <p className="text-sm text-[#4A5A6B]">{it.category}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Final CTA island ────────────────────────────── */}
      <section className="mx-auto max-w-[1240px] px-6 pb-24 lg:px-8">
        <Reveal>
          <div className="rounded-[36px] bg-[#152238] px-8 py-20 text-center lg:px-16">
            <h2 className="mx-auto max-w-2xl text-4xl font-extrabold tracking-[-0.02em] text-white sm:text-5xl">
              Ready to <span className="text-[#C3FFA5]">reduce churn</span>?
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-lg text-white/65">
              Bring your data and let ChAi surface who's at risk and what to do next — in plain
              English.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/auth"
                search={signup}
                className={`inline-flex items-center justify-center gap-2 rounded-[10px] bg-[#C3FFA5] px-6 py-3.5 text-base font-bold text-[#152238] transition-colors hover:bg-[#A8E080] ${focusRing}`}
              >
                Sign up free <ArrowRight className="h-4 w-4" />
              </Link>
              <button
                onClick={openGate}
                className={`inline-flex items-center justify-center gap-2 rounded-[10px] border border-white/25 px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-white/10 ${focusRing}`}
              >
                View demo
              </button>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Footer ──────────────────────────────────────── */}
      <footer className="mx-auto max-w-[1240px] px-6 pb-12 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 border-t border-[#D8E7EF] pt-8 text-sm text-[#4A5A6B] sm:flex-row">
          <img src="/logo-dark.png" alt="ChAi" className="h-12 w-auto" />
          <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <li>
              <button className={`rounded-[8px] hover:text-[#204654] ${focusRing}`} onClick={openGate}>
                Live demo
              </button>
            </li>
            <li>
              <Link className={`rounded-[8px] hover:text-[#204654] ${focusRing}`} to="/terms">Terms</Link>
            </li>
            <li>
              <Link className={`rounded-[8px] hover:text-[#204654] ${focusRing}`} to="/privacy">Privacy</Link>
            </li>
            <li>
              <Link className={`rounded-[8px] hover:text-[#204654] ${focusRing}`} to="/auth" search={login}>
                Log in
              </Link>
            </li>
          </ul>
          <p>© {new Date().getFullYear()} ChAi. All rights reserved.</p>
        </div>
      </footer>

      <DemoGateDialog open={demoOpen} onClose={closeGate} />
    </div>
  );
}
