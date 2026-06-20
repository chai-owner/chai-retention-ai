import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  FileSpreadsheet,
  Link2,
  Download,
  FileDown,
  Trash2,
  ArrowRight,
} from "lucide-react";
import { PageHeader, Card } from "@/components/ui/chai";
import {
  dataReadiness,
  readinessOverall,
  fieldMappings,
  integrations,
} from "@/lib/mock-data";
import {
  datasetSchemas,
  downloadCsvTemplate,
  downloadExcelTemplate,
} from "@/lib/data-schemas";
import {
  useUploads,
  uploadsStore,
  overallScore,
  type UploadRecord,
} from "@/lib/uploads-store";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/data")({
  head: () => ({ meta: [{ title: "Data & Integrations — Chai" }] }),
  component: DataPage,
});

function barColor(v: number) {
  return v >= 75 ? "bg-success" : v >= 50 ? "bg-warning" : v >= 35 ? "bg-caution" : "bg-danger";
}
function scoreChip(v: number) {
  return v >= 80
    ? "bg-success/10 text-success border-success/20"
    : v >= 60
      ? "bg-warning/15 text-warning-foreground border-warning/30"
      : v >= 40
        ? "bg-caution/10 text-caution border-caution/20"
        : "bg-danger/10 text-danger border-danger/20";
}

function DataPage() {
  const [dragging, setDragging] = useState(false);

  return (
    <div>
      <PageHeader
        title="Data & Integrations"
        description="Bring your customer, transaction and support data into Chai. We'll check how ready it is and map it for you."
      />

      {/* Readiness */}
      <Card>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold">Data readiness assessment</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Like a consultant, Chai checks what you're tracking and what's missing.
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

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Upload */}
        <Card>
          <h3 className="font-semibold">Upload your data</h3>
          <p className="mt-1 text-xs text-muted-foreground">CSV or Excel — customers, transactions, usage, support or surveys.</p>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              toast.success("File received", { description: "Chai is mapping your fields and checking data quality." });
            }}
            className={cn(
              "mt-4 flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors",
              dragging ? "border-primary bg-accent/40" : "border-border",
            )}
          >
            <UploadCloud className="h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">Drag & drop your file here</p>
            <p className="text-xs text-muted-foreground">or</p>
            <button
              onClick={() => toast.success("Upload started", { description: "Demo mode — no real file uploaded." })}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <FileSpreadsheet className="h-4 w-4" /> Browse files
            </button>
          </div>
        </Card>

        {/* Data quality */}
        <Card>
          <h3 className="font-semibold">Data quality engine</h3>
          <p className="mt-1 text-xs text-muted-foreground">Automatic checks on your most recent import.</p>
          <div className="mt-4 flex gap-3">
            <div className="flex-1 rounded-lg bg-secondary/60 p-3 text-center">
              <p className="text-xl font-semibold text-foreground">{dataQuality.reliability}%</p>
              <p className="text-xs text-muted-foreground">Reliability</p>
            </div>
            <div className="flex-1 rounded-lg bg-secondary/60 p-3 text-center">
              <p className="text-xl font-semibold text-foreground">{dataQuality.completeness}%</p>
              <p className="text-xs text-muted-foreground">Completeness</p>
            </div>
          </div>
          <ul className="mt-4 space-y-2">
            {dataQuality.findings.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                {f.level === "warning" ? (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-caution" />
                ) : (
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="text-muted-foreground">{f.text}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Field mapping */}
      <Card className="mt-6">
        <h3 className="font-semibold">Intelligent field mapping</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Chai automatically matches your columns to the fields it needs. Review and correct anything below.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Your column</th>
                <th className="py-2 pr-4 font-medium">Mapped to</th>
                <th className="py-2 font-medium">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {fieldMappings.map((m) => (
                <tr key={m.source} className="border-b border-border/60 last:border-0">
                  <td className="py-2.5 pr-4 font-mono text-xs text-muted-foreground">{m.source}</td>
                  <td className="py-2.5 pr-4 font-medium">{m.target}</td>
                  <td className="py-2.5">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                        m.confidence >= 90
                          ? "bg-success/10 text-success"
                          : m.confidence >= 80
                            ? "bg-warning/15 text-warning-foreground"
                            : "bg-caution/10 text-caution",
                      )}
                    >
                      {m.confidence >= 90 && <CheckCircle2 className="h-3 w-3" />}
                      {m.confidence}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Integrations */}
      <Card className="mt-6">
        <h3 className="font-semibold">Connect your support tools</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Support interactions are one of the strongest churn signals. Connect securely with OAuth.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {integrations.map((it) => (
            <div key={it.name} className="rounded-xl border border-border p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-primary">
                  <Link2 className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{it.name}</p>
                  <p className="text-[11px] text-muted-foreground">{it.category}</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{it.desc}</p>
              <button
                onClick={() => toast.info(`Connect ${it.name}`, { description: "Demo mode — OAuth flow not enabled." })}
                className="mt-3 w-full rounded-lg border border-border py-2 text-sm font-medium transition-colors hover:bg-accent"
              >
                Connect
              </button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
