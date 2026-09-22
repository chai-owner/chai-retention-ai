import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Plug, Brain, Rocket, Clock, TrendingDown, MessageSquareOff } from "lucide-react";

import { Reveal } from "@/components/landing/reveal";
import { DemoGateDialog, useDemoGate } from "@/components/landing/demo-gate";
import { XeroIcon, XeroColor } from "@/components/landing/brand-icons";
import { canonicalHead } from "@/lib/site";

const PATH = "/integrations/xero";
const META_TITLE = "Churn Analytics for Xero Users | ChAi";
const META_DESCRIPTION =
  "Connect Xero and see which customers are at risk — and why — in minutes. No spreadsheets, no data team, no setup.";

const faqs = [
  {
    q: "Do I need to clean up my Xero data first?",
    a: "No. Messy, incomplete, or inconsistent data is fine — ChAi is built to work with what you've already got.",
  },
  {
    q: "Does this replace my Customer Success team?",
    a: "No — and that's on purpose. ChAi's scoring and analysis are built around how your business actually thinks about customers. No auto-replies, no scripted outreach. Just a clearer picture, handed to a human.",
  },
  {
    q: "Is my Xero data secure?",
    a: "Yes — connected through Xero's official OAuth, encrypted with AES-256, and every sync runs server-side. Your Xero password never touches ChAi.",
  },
  {
    q: "How long does setup take?",
    a: "A few minutes to connect. ChAi starts learning your business immediately after.",
  },
];

const steps = [
  {
    n: "01",
    icon: Plug,
    title: "Connect Xero",
    desc: "A few clicks, no CSV exports, no manual field mapping.",
  },
  {
    n: "02",
    icon: Brain,
    title: "ChAi learns your business",
    desc: "Billing activity becomes one signal among several, weighted the way your business actually works.",
  },
  {
    n: "03",
    icon: Rocket,
    title: "Act before customers churn",
    desc: "See who's slipping, why, and what's likely to help, ranked by revenue at risk.",
  },
];

const signals = [
  { icon: Clock, text: "Invoices slipping past their due date, and staying there" },
  { icon: TrendingDown, text: "Invoice or order values trending down" },
  { icon: MessageSquareOff, text: "Long-standing customers going quiet on billing activity" },
];

const navItems = [
  { label: "Features", href: "/#features" },
  { label: "Integrations", href: "/#integrations" },
];

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C3FFA5] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent";

export const Route = createFileRoute("/integrations/xero")({
  head: () => ({
    meta: [
      { title: META_TITLE },
      ...canonicalHead(PATH).meta,
      { name: "description", content: META_DESCRIPTION },
      { property: "og:title", content: META_TITLE },
      { property: "og:description", content: META_DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: META_TITLE },
      { name: "twitter:description", content: META_DESCRIPTION },
    ],
    links: canonicalHead(PATH).links,
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }),
      },
    ],
  }),
  component: XeroIntegrationPage,
});

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-[8px] bg-[#A9E0F1]/50 px-3 py-1 text-xs font-semibold text-[#204654]">
      {children}
    </span>
  );
}

function XeroIntegrationPage() {
  const { open: demoOpen, openGate, closeGate } = useDemoGate();

  return (
    <div className="landing min-h-screen scroll-smooth font-sans antialiased">
      {/* ── Header + hero ─────────────────────────────── */}
      <section id="top" className="rounded-b-[36px] bg-[#152238] pb-20 lg:pb-28">
        <nav className="mx-auto flex h-20 max-w-[1240px] items-center gap-6 px-6 lg:px-8">
          <Link to="/" className={`flex items-center rounded-[10px] ${focusRing}`}>
            <img src="/logo-light.png" alt="ChAi" className="h-12 w-auto" />
          </Link>

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
            <a
              href="https://app.askchai.tech/auth"
              className={`rounded-[10px] px-3.5 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white ${focusRing}`}
            >
              Log in
            </a>
          </div>

          <a
            href="https://app.askchai.tech/auth?mode=signup"
            className={`group ml-auto inline-flex items-center gap-2 rounded-[10px] bg-[#C3FFA5] px-4 py-2.5 text-sm font-bold text-[#152238] transition-colors hover:bg-[#A8E080] md:ml-3 ${focusRing}`}
          >
            Get started
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </a>
        </nav>

        <div className="mx-auto mt-10 max-w-[900px] px-6 text-center lg:mt-16 lg:px-8">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-[10px] bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white/85">
              <span className="flex h-5 w-5 items-center justify-center rounded-[6px] bg-white" style={{ color: XeroColor }}>
                <XeroIcon className="h-3.5 w-3.5" />
              </span>
              Xero integration
            </span>
            <h1 className="mt-6 text-[2.4rem] font-extrabold leading-[1.05] tracking-[-0.02em] text-white sm:text-5xl lg:text-[3.6rem]">
              The churn signals are already in your Xero data. ChAi finds them.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-white/65">
              Overdue invoices, shrinking order sizes, customers who've gone quiet on billing — Xero
              already has the story. ChAi connects in minutes and turns it into a clear picture of
              who's at risk, why, and what to do next.
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <a
                href="https://app.askchai.tech/auth?mode=signup"
                className={`inline-flex items-center justify-center gap-2 rounded-[10px] bg-[#C3FFA5] px-6 py-3.5 text-base font-bold text-[#152238] transition-colors hover:bg-[#A8E080] ${focusRing}`}
              >
                Try it for free <ArrowRight className="h-4 w-4" />
              </a>
              <button
                onClick={openGate}
                className={`inline-flex items-center justify-center gap-2 rounded-[10px] border border-white/25 px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-white/10 ${focusRing}`}
              >
                View Demo
              </button>
            </div>
            <p className="mt-5 text-sm text-white/45">
              No credit card required · 14-day free trial · Cancel anytime
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Why QuickBooks alone isn't enough ──────────── */}
      <section className="mx-auto max-w-[1240px] px-6 py-24 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Eyebrow>The whole picture</Eyebrow>
          <h2 className="mt-4 text-3xl font-extrabold tracking-[-0.02em] sm:text-4xl">
            Billing data alone doesn't tell the whole story
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-[#4A5A6B]">
            A customer can stay current on invoices right up until the month they leave. ChAi combines
            what's happening in Xero with support tickets, usage, and CRM activity — so a change in
            billing pattern gets read alongside everything else, not in isolation.
          </p>
        </Reveal>
      </section>

      {/* ── How it works ───────────────────────────────── */}
      <section className="mx-auto max-w-[1240px] px-6 pb-24 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Eyebrow>How it works</Eyebrow>
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

      {/* ── Signals ────────────────────────────────────── */}
      <section className="mx-auto max-w-[1240px] px-6 pb-24 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Eyebrow>Signals</Eyebrow>
          <h2 className="mt-4 text-3xl font-extrabold tracking-[-0.02em] sm:text-4xl">
            What ChAi looks for in your Xero data
          </h2>
        </Reveal>

        <div className="mx-auto mt-12 max-w-2xl space-y-4">
          {signals.map((s, i) => (
            <Reveal key={s.text} delay={i * 80}>
              <div className="flex items-center gap-4 rounded-[16px] bg-white p-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#C3FFA5] text-[#152238]">
                  <s.icon className="h-5 w-5" strokeWidth={2} />
                </span>
                <p className="text-lg font-semibold text-[#152238]">{s.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1240px] px-6 pb-24 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Eyebrow>FAQ</Eyebrow>
          <h2 className="mt-4 text-3xl font-extrabold tracking-[-0.02em] sm:text-4xl">
            Questions Xero users ask us
          </h2>
        </Reveal>

        <div className="mx-auto mt-12 max-w-3xl space-y-4">
          {faqs.map((f, i) => (
            <Reveal key={f.q} delay={i * 70}>
              <div className="rounded-[18px] bg-white p-7">
                <h3 className="text-lg font-extrabold tracking-[-0.02em]">{f.q}</h3>
                <p className="mt-2 leading-relaxed text-[#4A5A6B]">{f.a}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────── */}
      <section className="mx-auto max-w-[1240px] px-6 pb-24 lg:px-8">
        <Reveal>
          <div className="rounded-[36px] bg-[#152238] px-8 py-20 text-center lg:px-16">
            <h2 className="mx-auto max-w-2xl text-4xl font-extrabold tracking-[-0.02em] text-white sm:text-5xl">
              Stop finding out about churn from a cancellation email.
            </h2>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href="https://app.askchai.tech/auth?mode=signup"
                className={`inline-flex items-center justify-center gap-2 rounded-[10px] bg-[#C3FFA5] px-6 py-3.5 text-base font-bold text-[#152238] transition-colors hover:bg-[#A8E080] ${focusRing}`}
              >
                Sign up free <ArrowRight className="h-4 w-4" />
              </a>
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

      {/* ── Footer ─────────────────────────────────────── */}
      <footer className="mx-auto max-w-[1240px] px-6 pb-12 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 border-t border-[#D8E7EF] pt-8 text-sm text-[#4A5A6B] sm:flex-row">
          <img src="/logo-dark.png" alt="ChAi" className="h-12 w-auto" />
          <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <li>
              <Link className={`rounded-[8px] hover:text-[#204654] ${focusRing}`} to="/">Home</Link>
            </li>
            <li>
              <Link className={`rounded-[8px] hover:text-[#204654] ${focusRing}`} to="/pricing">Pricing</Link>
            </li>
            <li>
              <Link className={`rounded-[8px] hover:text-[#204654] ${focusRing}`} to="/help">Help</Link>
            </li>
            <li>
              <Link className={`rounded-[8px] hover:text-[#204654] ${focusRing}`} to="/terms">Terms</Link>
            </li>
            <li>
              <Link className={`rounded-[8px] hover:text-[#204654] ${focusRing}`} to="/privacy">Privacy</Link>
            </li>
          </ul>
          <p>© {new Date().getFullYear()} ChAi. All rights reserved.</p>
        </div>
      </footer>

      <DemoGateDialog open={demoOpen} onClose={closeGate} />
    </div>
  );
}
