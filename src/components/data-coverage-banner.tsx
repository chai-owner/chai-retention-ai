// Warns the user when the intelligence on screen is built on missing or stale
// data, so a healthy-looking number is never mistaken for the full picture.
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Database } from "lucide-react";
import { useDataCoverage } from "@/lib/use-scored-data";
import { useIngestHydrated } from "@/lib/ingested-data-store";
import { useSignedIn } from "@/lib/use-auth-state";

export function DataCoverageBanner() {
  const coverage = useDataCoverage();
  const hydrated = useIngestHydrated();
  const signedIn = useSignedIn();
  // Before the account's saved rows have loaded the store is empty by
  // definition — warning then would falsely claim the user has no data.
  if (signedIn && !hydrated) return null;
  if (!coverage.flagged) return null;


  const low = coverage.confidence === "low";

  return (
    <div
      className={`rounded-xl border p-4 ${
        low ? "border-danger/30 bg-danger/5" : "border-warning/30 bg-warning/5"
      }`}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className={`mt-0.5 h-5 w-5 shrink-0 ${low ? "text-danger" : "text-warning"}`}
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{coverage.headline}</p>
          <ul className="mt-1.5 space-y-1 text-sm text-muted-foreground">
            {coverage.notes.slice(0, 4).map((n) => (
              <li key={n}>• {n}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            These figures are likely to change once recent data is added.
          </p>
          <Link
            to="/app/data"
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
          >
            <Database className="h-3.5 w-3.5" /> Add your data
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Small inline marker for a single card whose dataset is missing or stale. */
export function DataFlag({ datasetKey, label }: { datasetKey: string; label?: string }) {
  const coverage = useDataCoverage();
  const d = coverage.datasets.find((x) => x.key === datasetKey);
  if (!d || d.status === "ok") return null;
  const text =
    d.status === "missing"
      ? `No ${(label ?? d.label).toLowerCase()} data`
      : `${label ?? d.label} data is ${d.daysSince} days old`;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning-foreground">
      <AlertTriangle className="h-3 w-3" /> {text}
    </span>
  );
}
