import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Sparkles,
  Loader2,
  CalendarCheck,
  TrendingUp,
  Users,
  DollarSign,
  AlertTriangle,
  Database,
} from "lucide-react";
import { useRealAssessment, useDataCoverage } from "@/lib/use-scored-data";
import { coverageBasis } from "@/lib/data-coverage";
import { useProfile } from "@/lib/profile-store";
import { formatCurrency } from "@/lib/mock-data";
import { generateCollectiveInsights } from "@/lib/ai.functions";
import { markBooked } from "@/lib/profile.functions";

export const Route = createFileRoute("/_authenticated/app/welcome")({
  head: () => ({ meta: [{ title: "Your first insights — ChAi" }] }),
  component: WelcomePage,
});

const CALENDLY_URL =
  "https://calendly.com/calendar-askchai/30min?hide_event_type_details=1&hide_gdpr_banner=1&primary_color=c16e2d";

declare global {
  interface Window {
    Calendly?: { initPopupWidget: (opts: { url: string }) => void };
  }
}

function WelcomePage() {
  const { sufficiency, dataset } = useRealAssessment();
  const coverage = useDataCoverage();
  const profile = useProfile();
  const getInsights = useServerFn(generateCollectiveInsights);
  const recordBooked = useServerFn(markBooked);

  const [insights, setInsights] = useState<string[]>([]);
  const [loadingInsights, setLoadingInsights] = useState(sufficiency.enough);
  const [booked, setBooked] = useState(false);
  const requested = useRef(false);

  const hasSnapshot = sufficiency.enough && dataset != null;
  const flagged = dataset ? dataset.executive.atRisk + dataset.executive.critical : 0;

  // Fallback insights computed from the real dataset if the AI call fails.
  const fallbackInsights = useMemo(() => {
    if (!dataset) return [];
    const e = dataset.executive;
    return [
      `${e.critical + e.atRisk} of your ${e.totalCustomers} customers are showing churn-risk signals right now.`,
      `About ${formatCurrency(dataset.revenueAtRisk)} of revenue is currently exposed to churn.`,
      `Roughly ${formatCurrency(e.retentionOpportunity)} of that is realistically recoverable with the right outreach.`,
      `${e.healthy} customers are healthy — your strongest base to grow from and reference.`,
    ];
  }, [dataset]);

  useEffect(() => {
    if (!hasSnapshot || !dataset) return;
    if (requested.current) return;
    requested.current = true;

    const summary = [
      profile ? `Company: ${profile.company} (${profile.industry}, ${profile.model} model).` : "",
      `Customers analyzed: ${dataset.executive.totalCustomers}.`,
      `Total annual revenue reviewed: ${formatCurrency(dataset.totalRevenue)}.`,
      `Revenue currently at risk: ${formatCurrency(dataset.revenueAtRisk)}.`,
      `Recoverable revenue opportunity: ${formatCurrency(dataset.executive.retentionOpportunity)}.`,
      `Health mix — healthy ${dataset.executive.healthy}, watch ${dataset.executive.watch}, at-risk ${dataset.executive.atRisk}, critical ${dataset.executive.critical}.`,
      profile?.concerns ? `Owner's stated retention concerns: ${profile.concerns}.` : "",
    ]
      .filter(Boolean)
      .join("\n");

    getInsights({ data: { summary } })
      .then((res) => {
        setInsights(res.insights.length ? res.insights : fallbackInsights);
      })
      .catch(() => setInsights(fallbackInsights))
      .finally(() => setLoadingInsights(false));
  }, [getInsights, dataset, profile, fallbackInsights, hasSnapshot]);

  useEffect(() => {
    if (profile?.bookedAt) setBooked(true);
  }, [profile?.bookedAt]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (typeof e.data === "object" && e.data?.event === "calendly.event_scheduled") {
        setBooked(true);
        recordBooked().catch(() => {});
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [recordBooked]);

  function openCalendly() {
    if (window.Calendly) {
      window.Calendly.initPopupWidget({ url: CALENDLY_URL });
    } else {
      window.open(CALENDLY_URL, "_blank");
    }
  }

  const name = profile?.fullName?.split(" ")[0];

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-4">
      <div>
        <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <Sparkles className="h-3.5 w-3.5" />{" "}
          {hasSnapshot ? "Your initial assessment is ready" : "Welcome to ChAi"}
        </span>
        <h1 className="mt-4 text-2xl font-semibold sm:text-3xl">
          {hasSnapshot
            ? name
              ? `${name}, here's what we found`
              : "Here's what we found"
            : name
              ? `You're all set up, ${name}`
              : "You're all set up"}
        </h1>
        {hasSnapshot && dataset ? (
          <p className="mt-2 text-muted-foreground">
            We've analyzed{" "}
            <strong className="text-foreground">
              {dataset.executive.totalCustomers} customers
            </strong>{" "}
            from your own data — and surfaced{" "}
            <strong className="text-foreground">{flagged} accounts</strong> that need attention.
          </p>
        ) : (
          <p className="mt-2 text-muted-foreground">
            Your retention framework is built. The next step is your onboarding call.
          </p>
        )}
      </div>

      {hasSnapshot && dataset ? (
        <>
          {/* Quick stats */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              icon={Users}
              label="Customers analyzed"
              value={String(dataset.executive.totalCustomers)}
            />
            <Stat
              icon={DollarSign}
              label="Revenue reviewed"
              value={formatCurrency(dataset.totalRevenue)}
            />
            <Stat icon={AlertTriangle} label="Accounts flagged" value={String(flagged)} />
          </div>

          {/* Insights */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Your top insights</h2>
            </div>
            {loadingInsights ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Analyzing your data…
              </div>
            ) : (
              <ol className="mt-5 space-y-4">
                {insights.map((it, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {i + 1}
                    </span>
                    <p className="text-sm leading-relaxed">{it}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <CoverageNote coverage={coverage} />
        </>
      ) : (
        /* Not enough data for an accurate snapshot */
        <div className="rounded-2xl border border-warning/30 bg-warning/5 p-6 sm:p-8">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning-foreground">
              <Database className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold">Not enough data yet for an accurate snapshot</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {sufficiency.reason ||
                  "We need a bit more of your data before we can build a reliable business snapshot."}{" "}
                That's completely fine — we'll set everything up together on your onboarding call, and
                you can keep adding data any time.
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                {coverageBasis(coverage)} This assessment is likely to change as you add recent
                data.
              </p>
              <Link
                to="/app/data"
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
              >
                <Database className="h-4 w-4" /> Add your data
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Booking CTA */}
      <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-accent/50 to-transparent p-6 text-center sm:p-8">
        {booked ? (
          <div className="flex flex-col items-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
              <CalendarCheck className="h-6 w-6" />
            </span>
            <h3 className="mt-4 text-lg font-semibold">Your onboarding is booked 🎉</h3>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              We'll walk you through your full dashboard and insights on the call. Keep improving your
              inputs in the meantime — you can revisit your Business Profile and add more data any time.
            </p>
            <button
              onClick={openCalendly}
              className="mt-5 text-sm font-medium text-primary hover:underline"
            >
              Need to reschedule?
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={openCalendly}
              className="text-xl font-semibold text-primary underline underline-offset-4 hover:opacity-80 sm:text-2xl"
            >
              Book your onboarding session now!
            </button>
            <p className="mx-auto mt-4 max-w-md text-sm text-muted-foreground">
              We'll open up your full dashboard and detailed insights at your onboarding.
            </p>
            <h3 className="mt-6 text-lg font-semibold">This is just the beginning.</h3>
          </>
        )}
      </div>
    </div>
  );
}

function CoverageNote({ coverage }: { coverage: ReturnType<typeof useDataCoverage> }) {
  return (
    <div className="rounded-2xl border border-warning/30 bg-warning/5 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
        <div>
          <h3 className="text-sm font-semibold">This is a first read, not a final verdict</h3>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {coverageBasis(coverage)} This assessment is likely to change as you add recent data.
          </p>
          {coverage.notes.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {coverage.notes.slice(0, 4).map((n) => (
                <li key={n}>• {n}</li>
              ))}
            </ul>
          )}
          <Link
            to="/app/data"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
          >
            <Database className="h-3.5 w-3.5" /> Add or refresh your data
          </Link>
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}
