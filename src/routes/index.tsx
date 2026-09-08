import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
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
import heroDashboardAsset from "@/assets/hero-dashboard.png.asset.json";
import recommendationsPanelAsset from "@/assets/top-retention-recommendations.png.asset.json";
// Reduced to 50% (240 x 322) for tighter homepage layout
// import askChaiWidgetAsset from "@/assets/askchai-widget.png.asset.json";
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

const standardFeatures = [
  { icon: Target, title: "Stop guessing which numbers matter", desc: "ChAi learns how your business works and generates custom metrics that you should be measuring — no generic templates, no vanity numbers." },
  { icon: Gauge, title: "A health score you can actually trust", desc: "You decide what matters most. ChAi builds your health score around your judgment, not a predetermined black-box formula." },
  { icon: Share2, title: "One customer, one true picture", desc: "Data from different sources? No problem. ChAi figures out how to merge them — so you're never acting on only part of the story." },
  { icon: ShieldOff, title: "Delete data without losing insight", desc: "Honour a customer's erasure request in seconds, without punching a hole in your historical retention intelligence." },
];

const pairedFeatures = [
  { icon: TrendingUp, title: "See the dollar value, not just the risk", desc: "Every at-risk customer comes with a number attached — how much revenue is exposed, and how much is realistically recoverable. Prioritize by impact, not instinct." },
  { icon: ShieldCheck, title: "Skip the digging. Go straight to the fix.", desc: "No more trying to figure out \"why\" from scattered tickets and call notes. ChAi consolidates your intel, explains root causes in plain English and ranks next steps by the revenue they'll save." },
];

const scoreBands = [
  { label: "Healthy", color: "var(--success)", desc: "Engaged, paying on time, trending steady. Nothing to do here." },
  { label: "Watch", color: "var(--warning)", desc: "Early softening in usage or support signals. Worth keeping an eye on." },
  { label: "At risk", color: "var(--caution)", desc: "Clear decline. Worth a conversation this week." },
  { label: "Critical", color: "var(--danger)", desc: "Likely to leave soon without direct intervention." },
];

const steps = [
  { n: "01", icon: Plug, title: "Connect your tools", desc: "Bring in CRM, billing, support and spreadsheets — clean or messy, doesn't matter." },
  { n: "02", icon: Brain, title: "ChAi learns your business", desc: "It studies your industry, picks the metrics that matter, and scores every customer continuously." },
  { n: "03", icon: Rocket, title: "Act before customers churn", desc: "Wake up to a prioritised list of who to talk to today, and exactly what to say when you do." },
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
            <button
              onClick={openGate}
              className={`rounded-[10px] border border-white/25 px-3.5 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white ${focusRing}`}
            >
              View Demo
            </button>
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
              Know who's about to leave — and exactly what to do about it.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/65">
              Messy CRM? Data scattered across different platforms or spreadsheets? Doesn't matter.
              ChAi turns whatever data you've got into a clear picture of who's slipping — and what
              to do about it, before it's too late.
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
            <img
              src={heroDashboardAsset.url}
              alt="ChAi customer risk dashboard showing health score, churn probability, revenue value, and recommended actions"
              className="w-full scale-[1.15] translate-x-[5%] rounded-[8px] border border-white/10 shadow-2xl shadow-black/25"
            />
          </Reveal>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────── */}
      <section id="features" className="mx-auto max-w-[1240px] px-6 py-24 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Eyebrow>Features</Eyebrow>
          <h2 className="mt-4 text-3xl font-extrabold tracking-[-0.02em] sm:text-4xl">
            Everything you need to stop guessing and start saving customers
          </h2>
          <p className="mt-4 text-lg text-[#4A5A6B]">
            Built for how your own business actually works — not a generic dashboard bolted onto your data.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-6 sm:grid-cols-2">
          {standardFeatures.map((f, i) => (
            <Reveal key={f.title} delay={i * 80}>
              <div className="h-full rounded-[18px] bg-white p-8">
                <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-[#204654] text-white">
                  <f.icon className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <h3 className="mt-5 text-lg font-extrabold tracking-[-0.02em]">{f.title}</h3>
                <p className="mt-2 leading-relaxed text-[#4A5A6B]">{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <div className="mt-24 grid items-stretch gap-8 lg:mt-32 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            {pairedFeatures.map((f) => (
              <div key={f.title} className="flex-1 rounded-[18px] bg-white p-8">
                  <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-[#204654] text-white">
                    <f.icon className="h-5 w-5" strokeWidth={1.75} />
                  </span>
                  <h3 className="mt-5 text-lg font-extrabold tracking-[-0.02em]">{f.title}</h3>
                  <p className="mt-2 leading-relaxed text-[#4A5A6B]">{f.desc}</p>
              </div>
            ))}
          </div>
          <div className="flex min-h-0 items-center justify-center overflow-hidden rounded-[18px] bg-white p-3 shadow-sm lg:h-full">
              <img
                src={recommendationsPanelAsset.url}
                alt="ChAi top retention recommendations ranked by estimated revenue saved"
                className="h-auto max-h-full w-full object-contain"
              />
          </div>
        </div>
      </section>

      {/* ── Data Drop ───────────────────────────────────── */}
      <section id="data-drop" className="mx-auto max-w-[1240px] px-6 pb-24 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Eyebrow>No clean-up required</Eyebrow>
          <h2 className="mt-4 text-3xl font-extrabold tracking-[-0.02em] sm:text-4xl">
            Just drop your data in. We'll handle the rest.
          </h2>
          <p className="mt-4 text-lg text-[#4A5A6B]">
            You don't need a data team to get started. Export whatever you've got — from your CRM,
            billing tool, support platform, or a spreadsheet nobody's touched in a year — and drop it
            into ChAi. It automatically sorts, formats and maps everything into the metrics your health
            scores are built on.
          </p>
        </Reveal>

        <div className="mx-auto mt-12 max-w-2xl space-y-4">
          {[
            "No templates to fill in.",
            "No fields to match manually.",
            "No \"come back once your data's clean.\"",
          ].map((item, i) => (
            <Reveal key={item} delay={i * 80}>
              <div className="flex items-center gap-4 rounded-[16px] bg-white p-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#C3FFA5] text-[#152238]">
                  <Check className="h-5 w-5" strokeWidth={2.5} />
                </span>
                <p className="text-lg font-semibold text-[#152238]">{item}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Ask ChAi ─────────────────────────────────────── */}
      <section id="ask-chai" className="mx-auto max-w-[1240px] px-6 pb-24 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <Reveal className="order-1">
            <Eyebrow>Your retention analyst, on call</Eyebrow>
            <h2 className="mt-4 text-3xl font-extrabold tracking-[-0.02em] sm:text-4xl">
              Ask ChAi anything
            </h2>
            <p className="mt-4 text-lg text-[#4A5A6B]">
              No dashboard-diving required. Ask a plain question — "how do I improve retention?" —
              and get a specific, prioritised answer, grounded in your actual customer data.
            </p>
          </Reveal>
          <Reveal delay={120} className="order-2">
            <img
              src="/askchai-widget-50.png"
              alt="Ask ChAi chat widget showing a retention question and a prioritised, data-grounded answer"
              className="mx-auto w-full max-w-[240px]"
            />
          </Reveal>
        </div>
      </section>

      {/* ── How scoring works ───────────────────────────── */}
      <section id="scoring" className="mx-auto max-w-[1240px] px-6 pb-24 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Eyebrow>How scoring works</Eyebrow>
          <h2 className="mt-4 text-3xl font-extrabold tracking-[-0.02em] sm:text-4xl">
            One score. One meaning. Everywhere.
          </h2>
          <p className="mt-4 text-lg text-[#4A5A6B]">
            Every customer gets a 0–100 health score on the same four-stage scale — on this page and
            inside the app — so a colour always tells you the same thing.
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
            From connected to in control, in three steps
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
            Works with the tools you already run on
          </h2>
          <p className="mt-4 text-lg text-[#4A5A6B]">
            No migration. No rebuild. No "rip and replace." ChAi plugs into your existing stack and
            starts scoring from day one.
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
              Stop losing customers you could have saved.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-lg text-white/65">
              Bring your data — messy or not. Let ChAi tell you who's at risk and exactly what to do
              next, in plain English.
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
