import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  CheckCircle2,
  FileSpreadsheet,
  Link2,
  Upload,
  Trash2,
} from "lucide-react";
import { PageHeader, Card } from "@/components/ui/chai";
import { integrations } from "@/lib/mock-data";
import { UploadWizard } from "@/components/upload-wizard";
import { datasetSchemas } from "@/lib/data-schemas";
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

export const Route = createFileRoute("/_authenticated/app/data")({
  head: () => ({ meta: [{ title: "Data & Integrations — ChAi" }] }),
  component: DataPage,
});

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
  const uploads = useUploads();
  const profile = useProfile();

  const personalized = useMemo(
    () => personalizeDatasets(profile, datasetSchemas),
    [profile],
  );

  // Match uploads to dataset keys so we can flag what's still missing.
  const uploadedLabels = useMemo(
    () => new Set(uploads.map((u) => u.datasetLabel.toLowerCase())),
    [uploads],
  );
  const isUploaded = (d: PersonalizedDataset) =>
    uploadedLabels.has(d.label.toLowerCase());

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

      {/* What to upload — personalized to the onboarding profile, one line per dataset */}
      <Card>
        <h3 className="font-semibold">What to upload for your business</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {profile
            ? `Tailored to your ${profile.model} business and how you defined success. Upload each dataset below to power your retention model.`
            : "Upload each dataset below. Complete onboarding to tailor these to your business and industry."}
        </p>

        <div className="mt-5 divide-y divide-border border-y border-border">
          {personalized.map((s) => (
            <DatasetRow key={s.key} dataset={s} uploaded={isUploaded(s)} />
          ))}
        </div>
      </Card>

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

function DatasetRow({ dataset, uploaded }: { dataset: PersonalizedDataset; uploaded: boolean }) {
  const [wizardOpen, setWizardOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3 py-4 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold">{dataset.label}</p>
          {uploaded && (
            <span className="inline-flex items-center gap-1 rounded-full border border-success/20 bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
              <CheckCircle2 className="h-3 w-3" /> Uploaded
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{dataset.description}</p>

        {dataset.reasons.length > 0 && (
          <p className="mt-2 rounded-lg bg-accent/50 px-2.5 py-1.5 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">Why ChAi needs this: </span>
            {dataset.reasons.join(" ")}
          </p>
        )}

        <div className="mt-2 flex flex-wrap gap-1.5">
          {dataset.fields.map((f) => (
            <span
              key={f.name}
              title={f.description}
              className={cn(
                "rounded-md border px-1.5 py-0.5 font-mono text-[11px]",
                f.mandatory
                  ? "border-danger/30 bg-danger/10 text-danger"
                  : "border-border bg-secondary text-muted-foreground",
              )}
            >
              {f.name}
              {f.mandatory && " *"}
            </span>
          ))}
        </div>
      </div>

      <button
        onClick={() =>
          toast.success(`Upload ${dataset.label}`, {
            description: "Demo mode — choose a CSV or Excel file to import this dataset.",
          })
        }
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <Upload className="h-3.5 w-3.5" /> Upload {dataset.label}
      </button>
    </div>
  );
}
