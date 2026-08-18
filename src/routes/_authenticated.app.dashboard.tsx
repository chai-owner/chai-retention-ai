import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { summarizeRiskReasons } from "@/lib/ai.functions";
import {
  Users,
  HeartPulse,
  AlertTriangle,
  TrendingDown,
  DollarSign,
  Target,
  ArrowRight,
  Database,
  Sparkles,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUploads, overallScore } from "@/lib/uploads-store";
import {
  getCachedRiskSummaries,
  setCachedRiskSummaries,
  clearCachedRiskSummaries,
} from "@/lib/risk-summary-cache";
import { useAuthUserId } from "@/lib/use-auth-state";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { PageHeader, StatCard, Card, HealthBadge } from "@/components/ui/chai";
import {
  riskMeta,
  formatCurrency,
  categoryFromHealth,
  churnAnalytics,
} from "@/lib/mock-data";
import { useScoredData } from "@/lib/use-scored-data";
import { useSignedIn } from "@/lib/use-auth-state";
import { DataCoverageBanner } from "@/components/data-coverage-banner";

export const Route = createFileRoute("/_authenticated/app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — ChAi" }] }),
  component: Dashboard,
});

const COLORS: Record<string, string> = {
  healthy: "var(--success)",
  watch: "var(--warning)",
  "at-risk": "var(--caution)",
  critical: "var(--danger)",
};

type Period = "30d" | "month";

// Period adjustment factors applied to the base snapshot so the numbers shift
// when the user changes the dropdown. "Current Month" reflects the partial,
// in-progress month so totals are slightly lower than a full rolling 30 days.
const PERIOD_FACTORS: Record<Period, number> = {
  "30d": 1,
  month: 0.82,
};

function Dashboard() {
  const { executive: baseExecutive, healthDistribution, segmentRevenue, sortedByRisk } = useScoredData();
  const topRisk = sortedByRisk.slice(0, 5);
  const uploads = useUploads();
  const [period, setPeriod] = useState<Period>("30d");

  // AI-generated one-line explanations for each at-risk account.
  const summarize = useServerFn(summarizeRiskReasons);
  const [riskSummaries, setRiskSummaries] = useState<Record<string, string>>({});
  const [aiRefreshing, setAiRefreshing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiNonce, setAiNonce] = useState(0);
  const userId = useAuthUserId();

  // Cache key combines the signed-in user, the at-risk accounts and an "uploads
  // signature" so summaries never leak between accounts and regenerate whenever
  // new data is uploaded. Otherwise they're capped at one AI call per 24h.
  const uploadsSignature = `${uploads.length}:${uploads[0]?.id ?? "none"}:${uploads[0]?.uploadedAt ?? ""}`;
  const summaryKey = `${userId ?? "anon"}|${topRisk.map((c) => c.id).join(",")}|${uploadsSignature}`;

  useEffect(() => {
    if (topRisk.length === 0) return;
    if (userId === undefined) return; // wait until the session resolves
    let cancelled = false;

    // Reuse cached summaries when they're fresh (<24h) and built for the same
    // user, accounts and uploaded data — keeps AI usage to at most one call/day.
    if (aiNonce === 0) {
      const cached = getCachedRiskSummaries(summaryKey);
      if (cached) {
        setRiskSummaries(cached);
        return;
      }
    }

    setAiRefreshing(true);
    setAiError(null);
    summarize({
      data: {
        customers: topRisk.map((c) => ({
          id: c.id,
          name: c.name,
          churnProbability: c.churnProbability,
          revenue: c.revenue,
          health: c.health,
          factors: c.factors.map((f) => f.label),
        })),
      },
    })
      .then((res) => {
        if (!cancelled) {
          setRiskSummaries(res);
          setCachedRiskSummaries(summaryKey, res);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setAiError(
            err instanceof Error ? err.message : "The AI engine could not be reached.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setAiRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryKey, aiNonce]);

  const refreshAi = () => {
    clearCachedRiskSummaries();
    setRiskSummaries({});
    setAiNonce((n) => n + 1);
  };


  const executive = useMemo(() => {
    const f = PERIOD_FACTORS[period];
    const scale = (n: number) => Math.round(n * f);
    return {
      ...baseExecutive,
      atRisk: scale(baseExecutive.atRisk),
      critical: scale(baseExecutive.critical),
      predictedMonthlyChurn: scale(baseExecutive.predictedMonthlyChurn),
      revenueAtRisk: scale(baseExecutive.revenueAtRisk),
      predictedRevenueLoss: scale(baseExecutive.predictedRevenueLoss),
      retentionOpportunity: scale(baseExecutive.retentionOpportunity),
    };
  }, [baseExecutive, period]);

  // Signed-in users only ever see their own real data — the illustrative
  // churn/win-back sample analytics are demo-only.
  const signedIn = useSignedIn();
  const churn = useMemo(() => (signedIn === true ? null : churnAnalytics()), [signedIn]);

  // Overall data quality across uploaded datasets, for the selected period.
  // Current month relies on fewer, more recent files, so it's modestly lower.
  const dataQuality = useMemo(() => {
    if (uploads.length === 0) return 0;
    const avg = uploads.reduce((s, u) => s + overallScore(u), 0) / uploads.length;
    return Math.round(avg * (period === "month" ? 0.92 : 1));
  }, [uploads, period]);

  const qualityTone =
    dataQuality >= 75 ? "text-success" : dataQuality >= 55 ? "text-caution" : "text-danger";
  const qualityBarTone =
    dataQuality >= 75 ? "bg-success" : dataQuality >= 55 ? "bg-caution" : "bg-danger";
  const showSuggestion = dataQuality < 75;

  return (
    <div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-md">
          <PageHeader
            title="Dashboard"
            description="A 30-second snapshot of how healthy your customer base is, who's at risk, and how much revenue is on the line."
          />
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 sm:flex-row sm:items-stretch lg:w-auto">
          <div className="w-full sm:w-[200px]">
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="month">Current month</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Condensed data quality context for the selected period */}
          <div className="w-full rounded-lg border border-border bg-card p-3 sm:w-[240px]">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Database className="h-3.5 w-3.5" /> Data quality
              </span>
              <span className={`text-sm font-bold tabular-nums ${qualityTone}`}>{dataQuality}%</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary/60">
              <div className={`h-full rounded-full ${qualityBarTone}`} style={{ width: `${dataQuality}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <DataCoverageBanner />
      </div>



      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total customers" value={executive.totalCustomers} icon={Users} />
        <StatCard label="Healthy customers" value={executive.healthy} icon={HeartPulse} tone="success" hint="Engaged & low risk" />
        <StatCard label="At-risk customers" value={executive.atRisk + executive.critical} icon={AlertTriangle} tone="caution" hint={`${executive.critical} critical`} />
        <StatCard label="Predicted monthly churn" value={`${executive.predictedMonthlyChurn} customers`} icon={TrendingDown} tone="danger" />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Revenue at risk"
          value={
            <>
              {formatCurrency(executive.revenueAtRisk)}{" "}
              <span className="text-sm font-normal italic text-muted-foreground">per year</span>
            </>
          }
          icon={DollarSign}
          tone="danger"
          hint="Across at-risk & critical accounts"
        />
        <StatCard
          label="Retention opportunity"
          value={
            <>
              {formatCurrency(executive.retentionOpportunity)}{" "}
              <span className="text-sm font-normal italic text-muted-foreground">per year</span>
            </>
          }
          icon={Target}
          tone="success"
          hint="Recoverable with action"
        />
      </div>

      {churn && (
      <Link to="/app/churned" className="mt-4 block">
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-soft transition-colors hover:border-primary/40 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-danger/10 text-danger">
              <TrendingDown className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-medium">
                {churn.churnedCount} customers churned ·{" "}
                <span className="text-danger">{formatCurrency(churn.revenueLost)}</span>{" "}
                <span className="text-xs font-normal italic text-muted-foreground">/ yr lost</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(churn.winBackOpportunity)}/yr recoverable through win-back — excluded from active metrics above.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
            View win-back <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      </Link>
      )}


      <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">
        {/* Health distribution */}
        <Card className="self-start">
          <h3 className="font-semibold">Customer health distribution</h3>
          <p className="mt-1 text-xs text-muted-foreground">How your customers split across health bands.</p>
          <div className="mt-4 flex items-center gap-4">
            <div className="h-40 w-40 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={healthDistribution} dataKey="value" nameKey="name" innerRadius={44} outerRadius={70} paddingAngle={2}>
                    {healthDistribution.map((d) => (
                      <Cell key={d.key} fill={COLORS[d.key]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: "var(--card)",
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-2 text-xs">
              {healthDistribution.map((d) => (
                <div key={d.key} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLORS[d.key] }} />
                  <span className="text-muted-foreground">{d.name}</span>
                  <span className="ml-auto font-semibold tabular-nums">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Revenue by segment */}
        <Card className="self-start lg:col-span-2">
          <h3 className="font-semibold">Revenue & revenue at risk by segment</h3>
          <p className="mt-1 text-xs text-muted-foreground">Where your money — and your exposure — sits.</p>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={segmentRevenue} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="segment" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={70} />
                <Tooltip
                  formatter={(v: number) => formatCurrency(v)}
                  contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", fontSize: 12 }}
                />
                <Bar dataKey="revenue" fill="var(--chart-1)" radius={[6, 6, 0, 0]} name="Revenue" />
                <Bar dataKey="atRisk" fill="var(--danger)" radius={[6, 6, 0, 0]} name="At risk" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Top risk list */}
      <Card className="mt-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">Needs attention now</h3>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={refreshAi}
              disabled={aiRefreshing || topRisk.length === 0}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
            >
              <Sparkles className={`h-3 w-3 ${aiRefreshing ? "animate-pulse" : ""}`} />
              {aiRefreshing ? "Refreshing AI…" : "Refresh AI analysis"}
            </button>
            <Link to="/app/customers" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
        {aiError && (
          <p className="mt-2 text-xs text-danger">AI analysis unavailable: {aiError}</p>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {topRisk.map((c) => (
            <Link
              key={c.id}
              to="/app/customers/$id"
              params={{ id: c.id }}
              className="flex h-full flex-col gap-2 rounded-lg border border-border p-3 transition-colors hover:bg-accent/50"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(c.revenue)} · {c.churnProbability}% churn risk</p>
                </div>
                <HealthBadge category={categoryFromHealth(c.health)} />
              </div>
              {riskSummaries[c.id] && (
                <p className="flex items-start gap-1 text-xs text-foreground/80">
                  <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                  <span>{riskSummaries[c.id]}</span>
                </p>
              )}
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}

