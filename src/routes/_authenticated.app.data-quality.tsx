import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowRight, FileSpreadsheet, Trash2 } from "lucide-react";
import { PageHeader, Card } from "@/components/ui/chai";
import { dataReadiness, readinessOverall } from "@/lib/mock-data";
import {
  useUploads,
  uploadsStore,
  overallScore,
  type UploadRecord,
} from "@/lib/uploads-store";
import { useTickets, formatDuration, type TicketRecord } from "@/lib/tickets-store";
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

export const Route = createFileRoute("/_authenticated/app/data-quality")({
  head: () => ({ meta: [{ title: "Data Quality — ChAi" }] }),
  component: DataQualityPage,
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

function statusChip(status: string) {
  const s = status.toLowerCase();
  if (s === "resolved" || s === "closed") return "bg-success/10 text-success border-success/20";
  if (s === "reopened") return "bg-danger/10 text-danger border-danger/20";
  if (s === "in_progress" || s === "pending") return "bg-warning/15 text-warning-foreground border-warning/30";
  return "bg-secondary text-muted-foreground border-border";
}

function DataQualityPage() {
  const uploads = useUploads();
  const tickets = useTickets();

  function deleteUpload(u: UploadRecord) {
    uploadsStore.remove(u.id);
    toast.success("Upload deleted", { description: `${u.fileName} and its data were removed from ChAi.` });
  }

  return (
    <div>
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

      <Card className="mt-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Upload history</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Every file you've imported. Delete an upload to remove its data from ChAi.
            </p>
          </div>
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
    </div>
  );
}
