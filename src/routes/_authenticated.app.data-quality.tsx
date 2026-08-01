import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, Trash2, UserX, ScrollText, Link2, CheckCircle2 } from "lucide-react";
import { PageHeader, Card } from "@/components/ui/chai";
import { Input } from "@/components/ui/input";
import { dataReadiness, readinessOverall } from "@/lib/mock-data";
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
import { removePersistedBatch } from "@/lib/ingest-persistence";
import { useSignedIn } from "@/lib/use-auth-state";
import { useIngested } from "@/lib/ingested-data-store";
import { useCustomerAliases } from "@/lib/customer-aliases";
import {
  customerOptions,
  describeCounts,
  findUnmatched,
  type CustomerOption,
  type UnmatchedGroup,
} from "@/lib/customer-matching";
import { CustomerLinkWizard } from "@/components/customer-link-wizard";

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

const sampleAuditLog = [
  { who: "you@northwind.co", action: "Viewed customer Acme Labs", when: "2 minutes ago" },
  { who: "system", action: "Synced 142 tickets from Zendesk", when: "4 minutes ago" },
  { who: "you@northwind.co", action: "Exported risk report (CSV)", when: "Yesterday" },
  { who: "casey@northwind.co", action: "Deleted upload: transactions_q2.csv", when: "3 days ago" },
];

function DataQualityPage() {
  const uploads = useUploads();
  const signedIn = useSignedIn();
  const isReal = signedIn === true;
  const [forgetId, setForgetId] = useState("");

  function forgetCustomer() {
    const id = forgetId.trim();
    if (!id) return;
    setForgetId("");
    toast.success("Erasure request logged", {
      description: `Records for ${id} will be anonymised.`,
    });
  }



  function deleteUpload(u: UploadRecord) {
    uploadsStore.remove(u.id);
    // Also remove from the DB so refresh doesn't bring it back.
    void removePersistedBatch(u.id);
    toast.success("Upload deleted", { description: `${u.fileName} and its data were removed from ChAi.` });
  }

  return (
    <div>
      <PageHeader
        title="Data Quality Engine"
        description="Review your data readiness and identify gaps that could affect retention insights."
      />

      {!isReal && (
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
      )}

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

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Forget a customer */}
        <Card>
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
              <UserX className="h-4 w-4" />
            </span>
            <div>
              <h3 className="font-semibold">Forget a customer</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Handle a right-to-be-forgotten request. Personal details are removed and the
                customer's ID is anonymised, while aggregate metrics stay intact.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Input
              value={forgetId}
              onChange={(e) => setForgetId(e.target.value)}
              placeholder="Customer ID or email"
              aria-label="Customer ID or email to forget"
            />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  disabled={forgetId.trim().length === 0}
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:border-danger/40 hover:text-danger disabled:pointer-events-none disabled:opacity-50"
                >
                  <UserX className="h-4 w-4" /> Forget
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Forget this customer?</AlertDialogTitle>
                  <AlertDialogDescription>
                    We'll anonymise all records linked to{" "}
                    <span className="font-medium text-foreground">{forgetId.trim()}</span>. Their
                    personal details will no longer be recoverable.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={forgetCustomer}
                    className="bg-danger text-danger-foreground hover:bg-danger/90"
                  >
                    Forget customer
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </Card>

        {/* Audit log */}
        <Card>
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
              <ScrollText className="h-4 w-4" />
            </span>
            <div>
              <h3 className="font-semibold">Audit log</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                A record of data access, imports and deletions.
              </p>
            </div>
          </div>
          {isReal ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No activity recorded yet.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {sampleAuditLog.map((a, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <div>
                    <p>{a.action}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.who} · {a.when}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
