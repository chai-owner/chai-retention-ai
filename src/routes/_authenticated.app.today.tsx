import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sun, AlertTriangle, ActivityIcon, ArrowRight, RefreshCw, Sparkles } from "lucide-react";
import { getTodayBrief } from "@/lib/daily-brief.functions";
import { useAuthUserId } from "@/lib/use-auth-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/today")({
  head: () => ({
    meta: [
      { title: "Today — your daily customer brief | ChAi" },
      {
        name: "description",
        content:
          "Your daily ChAi brief: who is at risk right now, what changed since yesterday, and the five customers to act on today.",
      },
      { property: "og:title", content: "Today — your daily customer brief | ChAi" },
      {
        property: "og:description",
        content: "See who needs attention today and exactly what to do about it.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TodayPage,
});

function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const riskStyles: Record<string, string> = {
  critical: "bg-[var(--danger)]/10 text-[var(--danger)] border-[var(--danger)]/30",
  "at-risk": "bg-[var(--caution)]/10 text-[var(--caution)] border-[var(--caution)]/30",
  healthy: "bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/30",
};

const riskLabels: Record<string, string> = {
  critical: "Critical",
  "at-risk": "At risk",
  healthy: "Healthy",
};

function TodayPage() {
  const userId = useAuthUserId();
  const fetchBrief = useServerFn(getTodayBrief);
  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["today-brief", userId],
    queryFn: () => fetchBrief({ data: undefined }),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });

  const scoredLabel = data?.scoredAt
    ? new Date(data.scoredAt).toLocaleString(undefined, {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Sun className="h-4 w-4" />
            {greeting()}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            Here's your brief for today
          </h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={cn("mr-2 h-4 w-4", isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Summary card */}
      <section className="rounded-2xl border border-border bg-gradient-to-br from-card to-muted/40 p-6 shadow-sm">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Reading your latest scoring snapshot…</p>
        ) : error ? (
          <p className="text-sm text-[var(--danger)]">
            We couldn't load your brief just now. Try refreshing in a moment.
          </p>
        ) : (
          <>
            <p className="flex items-start gap-2 text-lg font-medium leading-snug text-foreground">
              <Sparkles className="mt-1 h-5 w-5 shrink-0 text-primary" />
              {data?.headline}
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <Stat
                icon={<AlertTriangle className="h-4 w-4 text-[var(--caution)]" />}
                value={data?.needsAttention ?? 0}
                label="need attention"
                sub={`${data?.criticalCount ?? 0} critical · ${data?.atRiskCount ?? 0} at risk`}
              />
              <Stat
                icon={<ActivityIcon className="h-4 w-4 text-primary" />}
                value={data?.movedCount ?? 0}
                label="scores moved"
                sub={`${data?.declinedCount ?? 0} down · ${data?.improvedCount ?? 0} up since yesterday`}
              />
              <Stat
                icon={<Sun className="h-4 w-4 text-[var(--success)]" />}
                value={data?.totalScored ?? 0}
                label="customers scored"
                sub={scoredLabel ? `Last scored ${scoredLabel}` : "Awaiting first scoring run"}
              />
            </div>
          </>
        )}
      </section>

      {/* Action list */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Do these first
        </h2>

        {!isLoading && (data?.actions.length ?? 0) === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Nothing needs chasing today. Enjoy it — we'll flag anyone who slips.
            </p>
          </div>
        ) : (
          (data?.actions ?? []).map((action, index) => (
            <article
              key={action.customerId}
              className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                  {index + 1}
                </span>
                <Link
                  to="/app/customers/$id"
                  params={{ id: action.customerId }}
                  className="text-base font-semibold text-foreground hover:text-primary"
                >
                  {action.name}
                </Link>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-xs font-medium",
                    riskStyles[action.riskLevel] ?? riskStyles.healthy,
                  )}
                >
                  {riskLabels[action.riskLevel] ?? action.riskLevel}
                </span>
                <span className="text-sm text-muted-foreground">
                  Health {action.score}/100
                  {action.delta != null && action.delta !== 0 ? (
                    <span className={action.delta < 0 ? "text-[var(--danger)]" : "text-[var(--success)]"}>
                      {" "}
                      ({action.delta > 0 ? "+" : ""}
                      {action.delta} since yesterday)
                    </span>
                  ) : null}
                </span>
              </div>

              {action.topMetric ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Driving the risk:{" "}
                  <span className="font-medium text-foreground">{action.topMetric}</span>
                  {action.topMetricValue != null
                    ? ` (currently ${Math.round(action.topMetricValue * 10) / 10})`
                    : ""}
                </p>
              ) : null}

              <p className="mt-2 text-sm leading-relaxed text-foreground">{action.action}</p>

              <Link
                to="/app/customers/$id"
                params={{ id: action.customerId }}
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                Open customer
                <ArrowRight className="h-4 w-4" />
              </Link>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

function Stat({
  icon,
  value,
  label,
  sub,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
