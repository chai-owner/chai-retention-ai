import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  UploadCloud,
  CheckCircle2,
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
import { useProfile } from "@/lib/profile-store";
import { personalizeDatasets, type PersonalizedDataset } from "@/lib/personalize-data";
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
  head: () => ({ meta: [{ title: "Data & Integrations — ChAi" }] }),
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
  const uploads = useUploads();
  const profile = useProfile();
  const avgQuality = uploads.length
    ? Math.round(uploads.reduce((s, u) => s + overallScore(u), 0) / uploads.length)
    : 0;

  const personalized = useMemo(
    () => personalizeDatasets(profile, datasetSchemas),
    [profile],
  );
  const requiredSets = personalized.filter((d) => d.required);
  const optionalSets = personalized.filter((d) => !d.required);

  // Match uploads to dataset keys so we can flag what's still missing.
  const uploadedLabels = useMemo(
    () => new Set(uploads.map((u) => u.datasetLabel.toLowerCase())),
    [uploads],
  );
  const isMissing = (d: PersonalizedDataset) =>
    !uploadedLabels.has(d.label.toLowerCase());

  function deleteUpload(u: UploadRecord) {
    uploadsStore.remove(u.id);
    toast.success("Upload deleted", { description: `${u.fileName} and its data were removed from ChAi.` });
  }


  return (
    <div>
      <PageHeader
        title="Data & Integrations"
        description="Bring your customer, transaction and support data into ChAi. We'll check how ready it is and map it for you."
      />

      {/* Readiness */}
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

      {/* Example templates — personalized to the onboarding profile */}
      <Card className="mt-6">
        <h3 className="font-semibold">What to upload for your business</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {profile
            ? `Tailored to your ${profile.model} business and how you defined success. Required datasets matter most for your retention model.`
            : "Download a ready-made template for each dataset. Complete onboarding to tailor these to your business."}
        </p>

        {requiredSets.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Required for your business
            </p>
            <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {requiredSets.map((s) => (
                <DatasetCard key={s.key} dataset={s} missing={isMissing(s)} />
              ))}
            </div>
          </div>
        )}

        {optionalSets.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Optional / recommended
            </p>
            <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {optionalSets.map((s) => (
                <DatasetCard key={s.key} dataset={s} missing={false} />
              ))}
            </div>
          </div>
        )}
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
              toast.success("File received", { description: "ChAi is mapping your fields and checking data quality." });
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

        {/* Data quality summary */}
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold">Data quality engine</h3>
              <p className="mt-1 text-xs text-muted-foreground">Average quality across all your uploads.</p>
            </div>
            <span className={cn("rounded-full border px-3 py-1 text-sm font-semibold", scoreChip(avgQuality))}>
              {avgQuality}%
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {uploads.slice(0, 3).map((u) => {
              const score = overallScore(u);
              return (
                <div key={u.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{u.fileName}</p>
                    <p className="text-[11px] text-muted-foreground">{u.datasetLabel} · {u.uploadedAt}</p>
                  </div>
                  <span className={cn("ml-3 shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium", scoreChip(score))}>
                    {score}%
                  </span>
                </div>
              );
            })}
            {uploads.length === 0 && (
              <p className="rounded-lg bg-secondary/50 px-3 py-4 text-center text-sm text-muted-foreground">
                No uploads yet — add a file to see its quality.
              </p>
            )}
          </div>
          <Link
            to="/app/data-quality"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            View All Uploads <ArrowRight className="h-4 w-4" />
          </Link>
        </Card>
      </div>

      {/* Upload history */}
      <Card className="mt-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Upload history</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Every file you've imported. Delete an upload to remove its data from ChAi.
            </p>
          </div>
          <Link to="/app/data-quality" className="hidden text-sm font-medium text-primary hover:underline sm:inline">
            View All Uploads
          </Link>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-4 font-medium">File</th>
                <th className="py-2 pr-4 font-medium">Dataset</th>
                <th className="hidden py-2 pr-4 font-medium sm:table-cell">Rows</th>
                <th className="hidden py-2 pr-4 font-medium md:table-cell">Uploaded</th>
                <th className="py-2 pr-4 font-medium">Quality</th>
                <th className="py-2 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {uploads.map((u) => {
                const score = overallScore(u);
                return (
                  <tr key={u.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2.5 pr-4">
                      <span className="flex items-center gap-2 font-medium">
                        <FileSpreadsheet className="h-4 w-4 shrink-0 text-muted-foreground" />
                        {u.fileName}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{u.datasetLabel}</td>
                    <td className="hidden py-2.5 pr-4 tabular-nums text-muted-foreground sm:table-cell">{u.rows.toLocaleString()}</td>
                    <td className="hidden py-2.5 pr-4 text-muted-foreground md:table-cell">{u.uploadedAt}</td>
                    <td className="py-2.5 pr-4">
                      <span className={cn("inline-block rounded-full border px-2 py-0.5 text-xs font-medium", scoreChip(score))}>
                        {score}%
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button
                            aria-label={`Delete ${u.fileName}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-danger/40 hover:text-danger"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this upload?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This permanently removes <span className="font-medium text-foreground">{u.fileName}</span> and all{" "}
                              {u.rows.toLocaleString()} rows it contributed. This can't be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteUpload(u)}
                              className="bg-danger text-danger-foreground hover:bg-danger/90"
                            >
                              Delete data
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {uploads.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">No uploads yet.</p>
          )}
        </div>
      </Card>

      {/* Field mapping */}
      <Card className="mt-6">
        <h3 className="font-semibold">Intelligent field mapping</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          ChAi automatically matches your columns to the fields it needs. Review and correct anything below.
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
