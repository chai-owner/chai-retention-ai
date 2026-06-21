import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Sparkles,
  ArrowRight,
  HeartPulse,
  AlertTriangle,
  Search,
  Lightbulb,
  ShieldCheck,
  BarChart3,
  MessageSquare,
} from "lucide-react";
import heroDashboard from "@/assets/hero-dashboard.jpg";
import dashMetricsShot from "@/assets/screenshots/dash-metrics.png.asset.json";
import dashTrendShot from "@/assets/screenshots/dash-trend.png.asset.json";
import customersShot from "@/assets/screenshots/customers.png.asset.json";
import insightsShot from "@/assets/screenshots/insights.png.asset.json";
import plannerShot from "@/assets/screenshots/planner.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ChAi — Your AI Customer Retention Analyst" },
      {
        name: "description",
        content:
          "ChAi scores customer health, predicts churn, explains why customers leave, and recommends what to do next — in plain English, no analytics expertise required.",
      },
      { property: "og:title", content: "ChAi — Your AI Customer Retention Analyst" },
      {
        property: "og:description",
        content: "Understand customer health, spot churn risk, and keep more revenue.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: HeartPulse, title: "Customer health, scored", desc: "A simple 0–100 score for every customer that blends usage, spend, support and sentiment." },
  { icon: AlertTriangle, title: "Churn risk, predicted", desc: "See exactly who is likely to leave next month and how much revenue is on the line." },
  { icon: Search, title: "Root cause, explained", desc: "For every at-risk account, the precise reasons — in plain English, not jargon." },
  { icon: Lightbulb, title: "Recommendations that act", desc: "Prioritized next steps ranked by expected revenue saved." },
  { icon: BarChart3, title: "Industry benchmarks", desc: "Know whether your retention is ahead of or behind comparable businesses." },
  { icon: ShieldCheck, title: "Trust & compliance", desc: "A GDPR-first control center so you can upload customer data with confidence." },
];

const steps = [
  { n: "01", title: "Teach ChAi your business", desc: "A short guided wizard learns how you operate and what a healthy customer looks like." },
  { n: "02", title: "Bring your data", desc: "Upload CSVs or connect your support tools. ChAi maps the fields and checks data quality for you." },
  { n: "03", title: "Get your retention plan", desc: "Health scores, risk flags, root causes and recommendations — ready in minutes." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-warm text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="text-lg font-semibold tracking-tight">ChAi</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/auth" className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:block">
              Sign in
            </Link>

            <Link
              to="/onboarding"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Get started <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-hero">
        <div className="mx-auto max-w-6xl px-4 py-20 text-center lg:px-6 lg:py-28">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            AI Retention Analyst, on demand
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
            Keep the customers you{" "}
            <span className="font-display italic font-normal text-primary">already worked so hard</span> to win.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            ChAi is an AI retention analyst that understands customer health, predicts who's about to leave,
            explains why, and tells you what to do — all in plain English. No analytics team required.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/onboarding"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-soft transition-colors hover:bg-primary/90"
            >
              Start free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/app/dashboard"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-6 py-3 text-sm font-medium transition-colors hover:bg-accent"
            >
              Explore the live demo
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">No credit card. Sample data included so you can look around.</p>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-20 lg:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Everything you need to stop churn</h2>
          <p className="mt-3 text-muted-foreground">
            From understanding what to measure to knowing exactly who to call today.
          </p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-card p-6 shadow-soft">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-primary">
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Product shots */}
      <section className="overflow-hidden border-y border-border bg-secondary/40">
        <div className="mx-auto max-w-6xl px-4 py-20 lg:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight">See it in action</h2>
            <p className="mt-3 text-muted-foreground">
              A clean, focused workspace that turns raw data into retention intelligence.
            </p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-3">
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-soft transition-transform hover:-translate-y-1 hover:shadow-md">
                <img
                  src={dashboardShot.url}
                  alt="ChAi Dashboard showing health scores and churn risk overview"
                  className="w-full object-cover"
                  loading="lazy"
                />
              </div>
              <p className="px-1 text-sm font-medium">Dashboard</p>
              <p className="px-1 text-xs text-muted-foreground">Health scores, revenue at risk, and key metrics at a glance.</p>
            </div>
            <div className="space-y-3">
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-soft transition-transform hover:-translate-y-1 hover:shadow-md">
                <img
                  src={customersShot.url}
                  alt="ChAi Customer Risk Center showing at-risk accounts and health scores"
                  className="w-full object-cover"
                  loading="lazy"
                />
              </div>
              <p className="px-1 text-sm font-medium">Customer Risk Center</p>
              <p className="px-1 text-xs text-muted-foreground">Spot who is about to leave and how much revenue is on the line.</p>
            </div>
            <div className="space-y-3 md:col-span-2 lg:col-span-1">
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-soft transition-transform hover:-translate-y-1 hover:shadow-md">
                <img
                  src={insightsShot.url}
                  alt="ChAi Insights and Benchmarks showing recommendations and customer lists"
                  className="w-full object-cover"
                  loading="lazy"
                />
              </div>
              <p className="px-1 text-sm font-medium">Insights & Benchmarks</p>
              <p className="px-1 text-xs text-muted-foreground">Prioritized recommendations ranked by expected revenue saved.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="border-y border-border bg-secondary/40">
        <div className="mx-auto max-w-6xl px-4 py-20 lg:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight">Up and running in three steps</h2>
          </div>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {steps.map((s) => (
              <div key={s.n}>
                <span className="font-display text-4xl italic text-primary">{s.n}</span>
                <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 py-20 lg:px-6">
        <div className="overflow-hidden rounded-2xl bg-gradient-warm px-8 py-14 text-center text-primary-foreground shadow-card">
          <MessageSquare className="mx-auto h-8 w-8 opacity-90" />
          <h2 className="mx-auto mt-4 max-w-xl text-3xl font-semibold tracking-tight">
            Meet your retention analyst
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-primary-foreground/90">
            Teach ChAi about your business and see your customer health in minutes.
          </p>
          <Link
            to="/onboarding"
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-background px-6 py-3 text-sm font-medium text-foreground transition-transform hover:scale-105"
          >
            Get started <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row lg:px-6">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-warm text-primary-foreground">
              <Sparkles className="h-3 w-3" />
            </span>
            <span className="font-semibold text-foreground">ChAi</span>
          </div>
          <p>Customer intelligence & retention, in plain English.</p>
        </div>
      </footer>
    </div>
  );
}
