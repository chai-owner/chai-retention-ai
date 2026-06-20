import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Users,
  HeartPulse,
  AlertTriangle,
  TrendingDown,
  DollarSign,
  Target,
  ArrowRight,
} from "lucide-react";
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
  executive,
  healthDistribution,
  retentionTrend,
  segmentRevenue,
  sortedByRisk,
  riskMeta,
  formatCurrency,
  categoryFromHealth,
} from "@/lib/mock-data";

export const Route = createFileRoute("/app/dashboard")({
  head: () => ({ meta: [{ title: "Executive Dashboard — ChAi" }] }),
  component: Dashboard,
});

const COLORS: Record<string, string> = {
  healthy: "var(--success)",
  watch: "var(--warning)",
  "at-risk": "var(--caution)",
  critical: "var(--danger)",
};

function Dashboard() {
  const topRisk = sortedByRisk.slice(0, 5);

  return (
    <div>
      <PageHeader
        title="Executive Dashboard"
        description="A 30-second snapshot of how healthy your customer base is, who's at risk, and how much revenue is on the line."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                className="flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-accent/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(c.revenue)} · {c.churnProbability}% churn risk</p>
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
