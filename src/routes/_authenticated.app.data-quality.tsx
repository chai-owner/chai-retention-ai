import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Card } from "@/components/ui/chai";
import { dataReadiness, readinessOverall } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/data-quality")({
  head: () => ({ meta: [{ title: "Data Quality — ChAi" }] }),
  component: DataQualityPage,
});

function barColor(v: number) {
  return v >= 75 ? "bg-success" : v >= 50 ? "bg-warning" : v >= 35 ? "bg-caution" : "bg-danger";
}

function DataQualityPage() {
  return (
    <div>
      <Link
        to="/app/data"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Data & Integrations
      </Link>

      <PageHeader
        title="Data Quality Engine"
        description="Review your data readiness and identify gaps that could affect retention insights."
      />

      <Card>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold">Data readiness assessment</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Like a consultant, ChAi checks what you're tracking and what's missing.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-accent/50 px-4 py-2">
            <span className="text-2xl font-semibold text-primary">{readinessOverall}%</span>
            <span className="text-xs text-muted-foreground">Overall retention readiness</span>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {dataReadiness.map((d) => (
            <div key={d.area}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{d.area}</span>
                <span className="tabular-nums text-muted-foreground">{d.score}%</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary">
                <div className={cn("h-full rounded-full", barColor(d.score))} style={{ width: `${d.score}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{d.note}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
