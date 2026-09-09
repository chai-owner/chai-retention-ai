import { Sparkles } from "lucide-react";

import { Card } from "@/components/ui/chai";
import { formatCurrency, type Customer } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const priorityChip: Record<string, string> = {
  High: "bg-danger/10 text-danger border-danger/20",
  Medium: "bg-warning/15 text-warning-foreground border-warning/30",
  Low: "bg-secondary text-secondary-foreground border-border",
};

/** Copy naming the signals ChAi analysed for this customer. */
export function analyzedCopyFor(signalLabels: string[]): string {
  const signals = signalLabels.filter(Boolean).slice(0, 4);
  if (signals.length === 0) {
    return "ChAi analyzed the data you've connected. Here's what's driving the risk.";
  }
  return `ChAi analyzed ${signals.slice(0, -1).join(", ")}${signals.length > 1 ? " and " : ""}${signals[signals.length - 1]}. Here's what's driving the risk.`;
}

/** "Why this customer is at risk" — weighted risk factors + confidence callout. */
export function RiskFactorsCard({
  customer: c,
  analyzedCopy,
  className,
}: {
  customer: Customer;
  analyzedCopy: string;
  className?: string;
}) {
  return (
    <Card className={className}>
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-primary">
          <Sparkles className="h-4 w-4" />
        </span>
        <h3 className="font-semibold">Why this customer is at risk</h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{analyzedCopy}</p>
      <div className="mt-4 space-y-4">
        {c.factors.map((f) => (
          <div key={f.label}>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{f.label}</span>
              <span className="text-xs text-muted-foreground">{f.weight}% of risk</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-danger"
                style={{ width: `${Math.min(100, f.weight * 2.6)}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{f.detail}</p>
          </div>
        ))}
        {c.factors.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No significant risk factors — this is a healthy account.
          </p>
        )}
      </div>
      <div className="mt-4 rounded-lg bg-accent/50 p-3 text-xs text-accent-foreground">
        <span className="font-medium">Confidence:</span> {Math.round(72 + c.risk / 5)}% — based on
        the volume and quality of data available for this customer.
      </div>
    </Card>
  );
}

/** "Recommended actions" — ranked list with difficulty, impact and revenue saved. */
export function RecommendedActionsCard({
  customer: c,
  limit,
  showSteps = true,
  className,
}: {
  customer: Customer;
  limit?: number;
  showSteps?: boolean;
  className?: string;
}) {
  const recommendations = limit ? c.recommendations.slice(0, limit) : c.recommendations;

  return (
    <Card className={className}>
      <h3 className="font-semibold">Recommended actions</h3>
      <p className="mt-1 text-xs text-muted-foreground">Ranked by expected revenue saved.</p>
      <div className="mt-4 space-y-3">
        {recommendations.map((r) => (
          <div key={r.title} className="rounded-lg border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium">{r.title}</p>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                  priorityChip[r.priority],
                )}
              >
                {r.priority}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{r.reasoning}</p>
            {showSteps && r.steps && r.steps.length > 0 && (
              <ol className="mt-2 space-y-1.5 text-xs text-foreground">
                {r.steps.map((s, i) => (
                  <li key={s} className="flex gap-2">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                      {i + 1}
                    </span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            )}
            <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
              <span>
                Difficulty: <span className="font-medium text-foreground">{r.difficulty}</span>
              </span>
              <span>
                Impact: <span className="font-medium text-foreground">{r.impact}</span>
              </span>
              <span>
                Est. saved:{" "}
                <span className="font-medium text-success">{formatCurrency(r.revenueSaved)}</span>
              </span>
            </div>
          </div>
        ))}

        {recommendations.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No actions needed right now — every tracked metric is in a healthy range for this
            customer.
          </p>
        )}
      </div>
    </Card>
  );
}
