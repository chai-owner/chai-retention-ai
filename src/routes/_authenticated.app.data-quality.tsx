import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, Trash2, UserX, ScrollText, Link2 } from "lucide-react";
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
import { removePersistedBatch, hydrateIngestFromServer } from "@/lib/ingest-persistence";
import {
  forgetCustomer,
  searchForgetCandidates,
  previewForgetCustomer,
} from "@/lib/customer-erasure.functions";
import {
  describeErasure,
  describePreview,
  totalDeleted,
  type ErasureCandidate,
  type ErasurePreview,
} from "@/lib/customer-erasure";
import { Search } from "lucide-react";
import { useSignedIn } from "@/lib/use-auth-state";


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
  const [forgetting, setForgetting] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchedFor, setSearchedFor] = useState("");
  const [candidates, setCandidates] = useState<ErasureCandidate[] | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [selected, setSelected] = useState<
    { candidate: ErasureCandidate; preview: ErasurePreview } | null
  >(null);

  async function handleSearch() {
    const q = forgetId.trim();
    if (q.length < 2 || searching) return;
    setSearching(true);
    try {
      setCandidates(await searchForgetCandidates({ data: { query: q } }));
      setSearchedFor(q);
    } catch (err) {
      toast.error("Search failed", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setSearching(false);
    }
  }

  async function handleSelect(candidate: ErasureCandidate) {
    setPreviewing(candidate.key);
    try {
      const preview = await previewForgetCustomer({ data: { identifier: candidate.key } });
      setSelected({ candidate, preview });
    } catch (err) {
      toast.error("Could not check this customer's records", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setPreviewing(null);
    }
  }

  async function handleForgetCustomer() {
    const id = selected?.candidate.key;
    if (!id || forgetting) return;
    setForgetting(true);
    try {
      const result = await forgetCustomer({ data: { identifier: id } });
      const description = describeErasure(result);
      if (totalDeleted(result) === 0 && result.scoresAnonymised === 0) {
        toast.error("Nothing to forget", { description });
        return;
      }
      setForgetId("");
      setCandidates(null);
      setSelected(null);
      // Re-read the account so the dashboard, insights and customer screens
      // immediately stop showing the erased customer.
      await hydrateIngestFromServer();
      toast.success("Customer erased", { description });
    } catch (err) {
      toast.error("Could not erase this customer", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setForgetting(false);
    }
  }



  async function deleteUpload(u: UploadRecord) {
    uploadsStore.remove(u.id);
    // Also remove from the DB so refresh doesn't bring it back.
    const ok = await removePersistedBatch(u.id);
    if (ok) {
      // Re-read the account's rows so the dashboard, insights and customer
      // screens immediately stop showing the deleted file's records.
      await hydrateIngestFromServer();
    }
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

      {/* Identity resolution pointer */}
      <Card className="mt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
              <Link2 className="h-4 w-4" />
            </span>
            <div>
              <h3 className="font-semibold">Identity Resolution</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Unmatched records, saved links, duplicate customers and connected identities all
                live in one hub.
              </p>
            </div>
          </div>
          <Link
            to="/app/identity"
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Open Identity Resolution
          </Link>
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
          <form
            className="mt-4 flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSearch();
            }}
          >
            <Input
              value={forgetId}
              onChange={(e) => setForgetId(e.target.value)}
              placeholder="Name, email or customer ID"
              aria-label="Search for a customer to forget"
            />
            <button
              type="submit"
              disabled={forgetId.trim().length < 2 || searching}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:border-primary/40 disabled:pointer-events-none disabled:opacity-50"
            >
              <Search className="h-4 w-4" /> {searching ? "Searching…" : "Search"}
            </button>
          </form>

          {candidates !== null && (
            <div className="mt-3">
              {candidates.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No customers match "{searchedFor}".
                </p>
              ) : (
                <>
                  <p className="mb-2 text-xs text-muted-foreground">
                    {candidates.length} match{candidates.length === 1 ? "" : "es"} — choose the
                    right person.
                  </p>
                  <ul className="max-h-72 space-y-1.5 overflow-y-auto">
                    {candidates.map((c) => (
                      <li
                        key={c.key}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                      >
                        <div className="min-w-0 text-xs">
                          <div className="truncate text-sm font-medium">
                            {c.name ?? c.email ?? c.key}
                          </div>
                          <div className="truncate text-muted-foreground">
                            {c.email ?? "No email"} · {c.sources.join(", ") || "Unknown source"}
                            {c.lastActivity ? ` · last activity ${c.lastActivity.slice(0, 10)}` : ""}
                          </div>
                          <div className="truncate text-muted-foreground">ID {c.key}</div>
                        </div>
                        <button
                          onClick={() => void handleSelect(c)}
                          disabled={previewing !== null}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-50"
                        >
                          <UserX className="h-3.5 w-3.5" />
                          {previewing === c.key ? "Checking…" : "Select"}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          <AlertDialog open={selected !== null} onOpenChange={(o) => !o && !forgetting && setSelected(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Forget this customer?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>
                      <span className="font-medium text-foreground">
                        {selected?.candidate.name ?? selected?.candidate.email ?? selected?.candidate.key}
                      </span>
                      {selected?.candidate.email ? ` (${selected.candidate.email})` : ""}
                    </p>
                    <p>
                      About to permanently delete:{" "}
                      <span className="font-medium text-foreground">
                        {selected ? describePreview(selected.preview) : ""}
                      </span>
                      .
                    </p>
                    {selected && selected.preview.scores > 0 && (
                      <p>
                        {selected.preview.scores} past health score
                        {selected.preview.scores === 1 ? "" : "s"} will be kept under an anonymous
                        ID so your trends don't change.
                      </p>
                    )}
                    <p>This can't be undone.</p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={forgetting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    void handleForgetCustomer();
                  }}
                  disabled={forgetting}
                  className="bg-danger text-danger-foreground hover:bg-danger/90"
                >
                  {forgetting ? "Erasing…" : "Forget customer"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
