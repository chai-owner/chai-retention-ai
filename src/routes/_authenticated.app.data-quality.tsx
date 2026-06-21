import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  AlertCircle,
  AlertTriangle,
  Info,
  Trash2,
  FileSpreadsheet,
  ShieldCheck,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Card, StatCard } from "@/components/ui/chai";
import {
  useUploads,
  uploadsStore,
  overallScore,
  type UploadRecord,
  type QualityFinding,
} from "@/lib/uploads-store";
import { dataReadiness, readinessOverall } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
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

export const Route = createFileRoute("/_authenticated/app/data-quality")({
  head: () => ({ meta: [{ title: "Data Quality — ChAi" }] }),
  component: DataQualityPage,
});

function scoreTone(v: number) {
  return v >= 80 ? "success" : v >= 60 ? "warning" : v >= 40 ? "caution" : "danger";
}
function scoreBar(v: number) {
  return v >= 80 ? "bg-success" : v >= 60 ? "bg-warning" : v >= 40 ? "bg-caution" : "bg-danger";
}
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

function FindingIcon({ level }: { level: QualityFinding["level"] }) {
  if (level === "critical") return <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />;
  if (level === "warning") return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-caution" />;
  return <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />;
}

function DataQualityPage() {
  const uploads = useUploads();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const avg = uploads.length
    ? Math.round(uploads.reduce((s, u) => s + overallScore(u), 0) / uploads.length)
    : 0;
  const totalRows = uploads.reduce((s, u) => s + u.rows, 0);
  const needsAttention = uploads.filter((u) => overallScore(u) < 60).length;

  function handleDelete(u: UploadRecord) {
    uploadsStore.remove(u.id);
    toast.success("Upload deleted", { description: `${u.fileName} and its data were removed from ChAi.` });
  }

  function toggle(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

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
        description="Every file you upload is scored for reliability and completeness. Review each upload's quality, see what's missing, and delete data you no longer want in ChAi."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Average quality" value={`${avg}%`} icon={ShieldCheck} tone={scoreTone(avg)} />
        <StatCard label="Total uploads" value={uploads.length} icon={FileSpreadsheet} />
        <StatCard label="Need attention" value={needsAttention} icon={AlertTriangle} tone={needsAttention ? "caution" : "success"} hint="Uploads scoring below 60%" />
      </div>

      {/* Data readiness assessment */}
      <Card className="mt-6">
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


      <div className="mt-6 space-y-3">
        {uploads.map((u) => {
          const score = overallScore(u);
          const isOpen = expandedId === u.id;
          return (
            <Card key={u.id} className="overflow-hidden">
              {/* Collapsed row — clickable to expand */}
              <button
                onClick={() => toggle(u.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/30"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
                  <FileSpreadsheet className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{u.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {u.datasetLabel} · {u.rows.toLocaleString()} rows · {u.sizeKb} KB · {u.uploadedAt}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-semibold", scoreChip(score))}>
                      {score}%
                    </span>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">Quality</p>
                  </div>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                      isOpen && "rotate-180"
                    )}
                  />
                  {/* Stop propagation so clicking Delete doesn't expand the card */}
                  <span
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0"
                  >
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-danger/40 hover:text-danger"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this upload?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This permanently removes <span className="font-medium text-foreground">{u.fileName}</span> and all{" "}
                            {u.rows.toLocaleString()} rows of data it contributed to ChAi. This can't be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(u)}
                            className="bg-danger text-danger-foreground hover:bg-danger/90"
                          >
                            Delete data
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </span>
                </div>
              </button>

              {/* Expanded detail */}
              {isOpen && (
                <div className="border-t border-border px-4 pb-5 pt-4">
                  <div className="grid gap-6 lg:grid-cols-2">
                    {/* Scores + field checks */}
                    <div>
                      <div className="flex gap-3">
                        <div className="flex-1 rounded-lg bg-secondary/60 p-3 text-center">
                          <p className="text-xl font-semibold">{u.reliability}%</p>
                          <p className="text-xs text-muted-foreground">Reliability</p>
                        </div>
                        <div className="flex-1 rounded-lg bg-secondary/60 p-3 text-center">
                          <p className="text-xl font-semibold">{u.completeness}%</p>
                          <p className="text-xs text-muted-foreground">Completeness</p>
                        </div>
                      </div>
                      <p className="mt-4 text-xs font-medium text-muted-foreground">Field completeness</p>
                      <div className="mt-2 space-y-2.5">
                        {u.fieldChecks.map((f) => (
                          <div key={f.field}>
                            <div className="flex items-center justify-between text-xs">
                              <span className="flex items-center gap-1.5 font-mono">
                                {f.field}
                                <span
                                  className={cn(
                                    "rounded px-1 py-px text-[10px] font-medium",
                                    f.mandatory ? "bg-danger/10 text-danger" : "bg-secondary text-muted-foreground",
                                  )}
                                >
                                  {f.mandatory ? "Required" : "Optional"}
                                </span>
                              </span>
                              <span className={cn("tabular-nums", f.mandatory && f.fill < 100 ? "text-danger" : "text-muted-foreground")}>
                                {f.fill}%
                              </span>
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                              <div className={cn("h-full rounded-full", scoreBar(f.fill))} style={{ width: `${f.fill}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Findings */}
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">What ChAi found</p>
                      <ul className="mt-2 space-y-2.5">
                        {u.findings.map((f, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <FindingIcon level={f.level} />
                            <span className="text-muted-foreground">{f.text}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          );
        })}

        {uploads.length === 0 && (
          <Card>
            <div className="py-12 text-center">
              <FileSpreadsheet className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 font-medium">No uploads yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Upload a file on the Data & Integrations page to see its quality here.
              </p>
              <Link
                to="/app/data"
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Go to Data & Integrations
              </Link>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
