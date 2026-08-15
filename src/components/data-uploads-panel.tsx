// Shared "add your data" UI: the ChAi Data Drop (AI ingest) card and the
// per-dataset CSV upload list. Used on both the Data & Integrations page and
// the onboarding "Add your data" step so they stay identical.
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Download, FileSpreadsheet, Lock, Sparkles, Upload } from "lucide-react";
import { Card } from "@/components/ui/chai";
import { UploadWizard } from "@/components/upload-wizard";
import { SmartIngestWizard } from "@/components/smart-ingest-wizard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { downloadCsvTemplate, downloadExcelTemplate } from "@/lib/data-schemas";
import { useProfile } from "@/lib/profile-store";
import { type PersonalizedDataset } from "@/lib/personalize-data";
import type { PlannerMetric } from "@/lib/mock-data";

import { useAllDatasets } from "@/lib/all-datasets";
import { useUploads } from "@/lib/uploads-store";
import { useAddons, addonsStore, SMART_INGEST_PRICING } from "@/lib/addons-store";
import { cn } from "@/lib/utils";


export function SmartIngestCard() {
  const { smartIngest } = useAddons();
  const [wizardOpen, setWizardOpen] = useState(false);

  if (!smartIngest) {
    const benefits = [
      "Drop in scanned invoices, PDFs, spreadsheets, receipts or text",
      "AI reads the document and maps the data into your ChAi datasets",
      "Review and fix everything before anything is saved",
    ];
    return (
      <Card className="border-primary/30 bg-gradient-to-br from-accent/40 to-transparent">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4" />
              </span>
              <h3 className="font-semibold">ChAi Data Drop</h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                <Lock className="h-3 w-3" /> Add-on
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Upload any customer document — no templates, no manual formatting. ChAi's AI extracts the
              relevant data and routes it into the right datasets.
            </p>
            <ul className="mt-3 space-y-1.5">
              {benefits.map((b) => (
                <li key={b} className="flex items-start gap-2 text-xs">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="shrink-0 rounded-xl border border-border bg-background p-4 text-center md:w-56">
            <p className="text-2xl font-bold">
              ${SMART_INGEST_PRICING.monthly}
              <span className="text-sm font-normal text-muted-foreground">/mo</span>
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Includes {SMART_INGEST_PRICING.includedPages} document pages/month, then $
              {SMART_INGEST_PRICING.topUpPerPage.toFixed(2)}/page.
            </p>
            <button
              onClick={() => {
                addonsStore.enable("smartIngest");
                toast.success("ChAi Data Drop enabled", {
                  description: "Demo mode — no billing was charged.",
                });
              }}
              className="mt-3 w-full rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Enable add-on
            </button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            <h3 className="font-semibold">ChAi Data Drop</h3>
            <span className="rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
              Active
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Upload one document or a whole folder's worth at once — invoices, PDFs, spreadsheets,
            receipts or text — and ChAi will extract and map the data for you to review.
          </p>
        </div>
        <button
          onClick={() => setWizardOpen(true)}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Upload className="h-4 w-4" /> Upload documents
        </button>
      </div>
      <SmartIngestWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </Card>
  );
}

function recencyColor(date: string) {
  const days = (Date.now() - new Date(date.replace(" ", "T")).getTime()) / 86400000;
  if (days <= 30) return "text-success";
  if (days <= 90) return "text-warning";
  return "text-danger";
}

export function UploadDatasetsCard({ metrics }: { metrics?: PlannerMetric[] } = {}) {
  const uploads = useUploads();
  const profile = useProfile();
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [wizardOpen, setWizardOpen] = useState(false);

  const personalized = useAllDatasets(metrics);


  const lastUploadByLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of uploads) {
      const key = u.datasetLabel.toLowerCase();
      const existing = map.get(key);
      if (!existing || u.uploadedAt > existing) map.set(key, u.uploadedAt);
    }
    return map;
  }, [uploads]);

  const selected = personalized.find((d) => d.key === selectedKey);
  const lastUpload = selected ? lastUploadByLabel.get(selected.label.toLowerCase()) : undefined;

  return (
    <Card className="mt-6">
      <h3 className="font-semibold">Upload your data</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {profile
          ? `Pick what you're uploading. ChAi will show you the recommended template for your ${profile.model} business.`
          : "Pick what you're uploading. ChAi will show you the recommended template. Complete onboarding to tailor these to your business."}
      </p>

      <div className="mt-5 space-y-2">
        <label className="text-xs font-medium text-muted-foreground">What are you uploading?</label>
        <Select value={selectedKey} onValueChange={setSelectedKey}>
          <SelectTrigger className="w-full md:w-96">
            <SelectValue placeholder="Choose a dataset or metric…" />
          </SelectTrigger>
          <SelectContent>
            {personalized.map((d) => (
              <SelectItem key={d.key} value={d.key}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selected && (
        <div className="mt-5 rounded-xl border border-border bg-accent/20 p-4">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold">{selected.label}</p>
            <p className="text-xs text-muted-foreground">{selected.description}</p>
          </div>

          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Recommended template
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {selected.fields.map((f) => (
                <span
                  key={f.name}
                  title={f.description}
                  className={cn(
                    "rounded-md border px-1.5 py-0.5 font-mono text-[11px]",
                    f.mandatory
                      ? "border-danger/30 bg-danger/10 text-danger"
                      : f.identifier
                        ? "border-warning/40 bg-warning/10 text-warning"
                        : "border-border bg-secondary text-muted-foreground",
                  )}
                >
                  {f.name}
                  {f.mandatory ? " *" : f.identifier ? " †" : ""}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Fields marked <span className="text-danger">*</span> are required.
              {selected.fields.some((f) => f.identifier) && (
                <>
                  {" "}
                  Fields marked <span className="text-warning">†</span> identify the customer — you
                  must provide at least one of them (customer_id, email or customer_name) on every
                  row.
                </>
              )}{" "}
              Download a starter template to get the exact column names.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => downloadCsvTemplate(selected)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
              >
                <Download className="h-3.5 w-3.5" /> CSV template
              </button>
              <button
                onClick={() => downloadExcelTemplate(selected)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" /> Excel template
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-2 border-t border-border pt-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium">Ready to upload?</p>
              {lastUpload ? (
                <p className={cn("text-[11px] italic", recencyColor(lastUpload))}>
                  Last uploaded on {lastUpload}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">No file uploaded yet.</p>
              )}
            </div>
            <button
              onClick={() => setWizardOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Upload className="h-4 w-4" /> Upload file
            </button>
          </div>

          <UploadWizard dataset={selected} open={wizardOpen} onOpenChange={setWizardOpen} />
        </div>
      )}
    </Card>
  );
}

// Convenience wrapper: the full "add your data" section (AI drop + CSV uploads).
export function DataUploadsPanel() {
  return (
    <>
      <SmartIngestCard />
      <UploadDatasetsCard />
    </>
  );
}
