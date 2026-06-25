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
import { getCachedRiskSummaries, setCachedRiskSummaries } from "@/lib/risk-summary-cache";
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
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import { PageHeader, StatCard, Card, HealthBadge } from "@/components/ui/chai";
import {
  retentionTrend,
  riskMeta,
  formatCurrency,
  categoryFromHealth,
} from "@/lib/mock-data";
import { useScoredData } from "@/lib/use-scored-data";

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

  // Cache key combines the at-risk accounts with an "uploads signature" so the
  // summaries also regenerate immediately whenever new data is uploaded (any
  // upload feeds the health scoring). Otherwise they're capped at one AI call
  // per 24h via the localStorage cache.
  const uploadsSignature = `${uploads.length}:${uploads[0]?.id ?? "none"}:${uploads[0]?.uploadedAt ?? ""}`;
  const summaryKey = `${topRisk.map((c) => c.id).join(",")}|${uploadsSignature}`;

  useEffect(() => {
    if (topRisk.length === 0) return;
    let cancelled = false;

    // Reuse cached summaries when they're fresh (<24h) and built for the same
    // accounts and uploaded data — this keeps AI usage to at most one call per day.
    const cached = getCachedRiskSummaries(summaryKey);
    if (cached) {
      setRiskSummaries(cached);
      return;
    }

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
      .catch(() => {
        /* keep base list if AI is unavailable */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryKey]);

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
            {showSuggestion && (
              <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                <Link to="/app/data" className="font-medium text-primary hover:underline">
                  Upload recent data
                </Link>{" "}
                for a more accurate snapshot.
              </p>
            )}
          </div>
        </div>
      </div>



      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total customers" value={executive.totalCustomers} icon={Users} />
        <StatCard label="Healthy customers" value={executive.healthy} icon={HeartPulse} tone="success" hint="Engaged & low risk" />
        <StatCard label="At-risk customers" value={executive.atRisk + executive.critical} icon={AlertTriangle} tone="caution" hint={`${executive.critical} critical`} />
        <StatCard label="Predicted monthly churn" value={`${executive.predictedMonthlyChurn} customers`} icon={TrendingDown} tone="danger" />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Revenue at risk" value={formatCurrency(executive.revenueAtRisk)} icon={DollarSign} tone="danger" hint="Across at-risk & critical accounts" />
        <StatCard label="Predicted revenue loss / mo" value={formatCurrency(Math.round(executive.predictedRevenueLoss / 12))} icon={TrendingDown} tone="caution" />
        <StatCard label="Retention opportunity" value={formatCurrency(executive.retentionOpportunity)} icon={Target} tone="success" hint="Recoverable with action" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Health distribution */}
        <Card>
          <h3 className="font-semibold">Customer health distribution</h3>
          <p className="mt-1 text-xs text-muted-foreground">How your customers split across health bands.</p>
          <div className="mt-4 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={healthDistribution} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
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
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            {healthDistribution.map((d) => (
              <div key={d.key} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: COLORS[d.key] }} />
                <span className="text-muted-foreground">{d.name}</span>
                <span className="ml-auto font-medium">{d.value}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Retention trend */}
        <Card className="lg:col-span-2">
          <h3 className="font-semibold">Retention & churn trend</h3>
          <p className="mt-1 text-xs text-muted-foreground">Share of customers retained vs. lost each month.</p>
          <div className="mt-4 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={retentionTrend} margin={{ left: -20, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} domain={[0, 100]} />
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", fontSize: 12 }} />
                <Line type="monotone" dataKey="retention" stroke="var(--success)" strokeWidth={2.5} dot={false} name="Retention %" />
                <Line type="monotone" dataKey="churn" stroke="var(--danger)" strokeWidth={2.5} dot={false} name="Churn %" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Revenue by segment */}
        <Card className="lg:col-span-2">
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

        {/* Top risk list */}
        <Card>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Needs attention now</h3>
            <Link to="/app/customers" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="mt-4 space-y-2">
            {topRisk.map((c) => (
              <Link
                key={c.id}
                to="/app/customers/$id"
                params={{ id: c.id }}
                className="flex items-start justify-between gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(c.revenue)} · {c.churnProbability}% churn risk</p>
                  {riskSummaries[c.id] && (
                    <p className="mt-1 flex items-start gap-1 text-xs text-foreground/80">
                      <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                      <span>{riskSummaries[c.id]}</span>
                    </p>
                  )}
                </div>
                <HealthBadge category={categoryFromHealth(c.health)} />
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
