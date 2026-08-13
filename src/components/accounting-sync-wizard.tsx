// Accounting sync overlay — pulls live customers + invoices from a connected
// accounting tool (QuickBooks Online, Xero or FreshBooks) via the real OAuth
// connection, then shows the same editable review screen as ChAi Data Drop
// before anything is saved. Nothing is imported until the data is clean and the
// user confirms.
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Receipt, Loader2, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { type DatasetSchema } from "@/lib/data-schemas";
import { useAllSchemas } from "@/lib/all-datasets";
import {
  syncAccounting,
  type AccountingProvider,
} from "@/lib/accounting.functions";
import type { ExtractedDataset } from "@/lib/ingest.functions";
import {
  uploadsStore,
  type FieldCheck,
  type QualityFinding,
  type UploadRecord,
} from "@/lib/uploads-store";
import { ingestedStore, rowsToObjects, tagSource } from "@/lib/ingested-data-store";
import { persistBatch } from "@/lib/ingest-persistence";


type FieldType = "date" | "number" | "email" | "text";

function inferType(name: string, example: string): FieldType {
  const n = name.toLowerCase();
  if (n.includes("email")) return "email";
  if (n.includes("date")) return "date";
  if (/^\d+(\.\d+)?$/.test((example || "").trim())) return "number";
  if (/(amount|revenue|score|logins|minutes|features_used|price|qty|quantity|count)/.test(n))
    return "number";
  return "text";
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateValue(type: FieldType, raw: string): string | null {
  const v = (raw ?? "").trim();
  if (v === "") return null;
  switch (type) {
    case "number":
      return /^-?\d+(\.\d+)?$/.test(v.replace(/[$,]/g, "")) ? null : `expected a number`;
    case "date":
      return DATE_RE.test(v) && !isNaN(Date.parse(v)) ? null : `expected YYYY-MM-DD`;
    case "email":
      return EMAIL_RE.test(v) ? null : `expected an email`;
    default:
      return null;
  }
}

interface EditableDataset {
  key: string;
  label: string;
  schema: DatasetSchema;
  rows: string[][];
  confidence: number;
}

function buildEditable(
  extracted: ExtractedDataset[],
  schemas: DatasetSchema[],
): EditableDataset[] {
  const out: EditableDataset[] = [];
  for (const d of extracted) {
    const schema = schemas.find((s) => s.key === d.key);
    if (!schema) continue;
    const headers = schema.fields.map((f) => f.name);
    const idxFor = (name: string) =>
      d.headers.findIndex(
        (h) =>
          h.toLowerCase().replace(/[^a-z0-9]/g, "") ===
          name.toLowerCase().replace(/[^a-z0-9]/g, ""),
      );
    const rows = d.rows.map((r) =>
      headers.map((h) => {
        const i = idxFor(h);
        return i >= 0 ? (r[i] ?? "") : "";
      }),
    );
    out.push({ key: d.key, label: d.label, schema, rows, confidence: d.confidence });
  }
  return out;
}

export function AccountingSyncWizard({
  provider,
  providerName,
  open,
  onOpenChange,
  onImported,
}: {
  provider: AccountingProvider;
  providerName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported?: () => void;
}) {
  const allSchemas = useAllSchemas();
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [datasets, setDatasets] = useState<EditableDataset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const runSync = useServerFn(syncAccounting);

  function reset() {
    setBusy(false);
    setLoaded(false);
    setDatasets([]);
    setError(null);
  }
  function close() {
    onOpenChange(false);
    setTimeout(reset, 200);
  }

  // Pull live data as soon as the dialog opens.
  useEffect(() => {
    if (!open || loaded || busy) return;
    let cancelled = false;
    setBusy(true);
    setError(null);
    runSync({ data: { provider } })
      .then((res) => {
        if (cancelled) return;
        const editable = buildEditable(res.datasets as ExtractedDataset[], allSchemas);
        setDatasets(editable);
        setLoaded(true);
        setBusy(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Sync failed");
        setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps


  function setCell(dsIdx: number, rowIdx: number, colIdx: number, value: string) {
    setDatasets((prev) =>
      prev.map((d, di) =>
        di === dsIdx
          ? {
              ...d,
              rows: d.rows.map((r, ri) =>
                ri === rowIdx ? r.map((c, ci) => (ci === colIdx ? value : c)) : r,
              ),
            }
          : d,
      ),
    );
  }
  function removeRow(dsIdx: number, rowIdx: number) {
    setDatasets((prev) =>
      prev.map((d, di) =>
        di === dsIdx ? { ...d, rows: d.rows.filter((_, ri) => ri !== rowIdx) } : d,
      ),
    );
  }

  const errorCount = useMemo(() => {
    let count = 0;
    for (const d of datasets) {
      for (const r of d.rows) {
        d.schema.fields.forEach((f, ci) => {
          const type = inferType(f.name, f.example);
          const raw = (r[ci] ?? "").trim();
          if (raw === "" && f.mandatory) count++;
          else if (raw !== "" && validateValue(type, raw)) count++;
        });
      }
    }
    return count;
  }, [datasets]);

  const totalRows = datasets.reduce((a, d) => a + d.rows.length, 0);

  function confirmAndSave() {
    if (errorCount > 0 || totalRows === 0) return;
    const uploadedAt = new Date().toISOString().slice(0, 16).replace("T", " ");
    for (const d of datasets) {
      if (d.rows.length === 0) continue;
      let filled = 0;
      const totalCells = d.rows.length * d.schema.fields.length || 1;
      const fieldChecks: FieldCheck[] = d.schema.fields.map((f, ci) => {
        const nonEmpty = d.rows.filter((r) => (r[ci] ?? "").trim() !== "").length;
        filled += nonEmpty;
        return {
          field: f.name,
          mandatory: f.mandatory,
          fill: d.rows.length ? Math.round((nonEmpty / d.rows.length) * 100) : 0,
        };
      });
      const completeness = Math.round((filled / totalCells) * 100);
      const reliability = Math.min(100, Math.round((d.confidence + completeness) / 2));
      const findings: QualityFinding[] = [
        { level: "info", text: `Synced from ${providerName}.` },
      ];
      const record: UploadRecord = {
        id: `acct_${provider}_${d.key}_${Date.now().toString(36)}`,
        fileName: `${providerName} — ${d.label}`,
        datasetKey: d.key,
        datasetLabel: d.label,
        uploadedAt,
        rows: d.rows.length,
        sizeKb: 0,
        reliability,
        completeness,
        findings,
        fieldChecks,
      };
      uploadsStore.add(record);
      const rowObjects = tagSource(rowsToObjects(d.schema.fields.map((f) => f.name), d.rows), provider);
      ingestedStore.addRows(d.key, rowObjects);
      void persistBatch({
        localUploadId: record.id,
        source_kind: "accounting",
        source_provider: provider,
        dataset_key: d.key,
        filename: record.fileName,
        rows: rowObjects,
        meta: { datasetLabel: d.label, reliability, completeness, sizeKb: 0, findings, fieldChecks },
      });
    }
    toast.success(`${providerName} data imported`, {
      description: `${totalRows.toLocaleString()} rows across ${datasets.length} dataset${
        datasets.length > 1 ? "s" : ""
      } added to ChAi.`,
    });
    onImported?.();
    close();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" /> Sync from {providerName}
          </DialogTitle>
          <DialogDescription>
            Review the customers and invoices ChAi pulled from {providerName}, fix anything that
            looks off, then confirm. Nothing is saved until you import.
          </DialogDescription>
        </DialogHeader>

        {!loaded && !error && (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-sm font-medium">Pulling records from {providerName}…</span>
            <span className="text-xs text-muted-foreground">
              Fetching customers and invoices through your secure connection.
            </span>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <AlertTriangle className="h-8 w-8 text-danger" />
            <span className="text-sm font-medium">Couldn’t sync from {providerName}</span>
            <span className="max-w-md text-xs text-muted-foreground">{error}</span>
          </div>
        )}

        {loaded && (
          <div className="space-y-5 py-1">
            {datasets.map((d, di) => (
              <div key={d.key} className="rounded-lg border border-border">
                <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                  <div>
                    <span className="text-sm font-semibold">{d.label}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {d.rows.length} row{d.rows.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-medium",
                      d.confidence >= 80
                        ? "bg-success/10 text-success"
                        : d.confidence >= 60
                          ? "bg-warning/10 text-warning"
                          : "bg-danger/10 text-danger",
                    )}
                  >
                    {d.confidence}% confidence
                  </span>
                </div>
                <div className="max-h-72 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-secondary">
                      <tr className="text-left">
                        {d.schema.fields.map((f) => (
                          <th key={f.name} className="px-2 py-1.5 font-mono font-medium">
                            {f.name}
                            {f.mandatory && <span className="text-danger"> *</span>}
                          </th>
                        ))}
                        <th className="px-2 py-1.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {d.rows.map((r, ri) => (
                        <tr key={ri} className="border-t border-border">
                          {d.schema.fields.map((f, ci) => {
                            const type = inferType(f.name, f.example);
                            const raw = (r[ci] ?? "").trim();
                            const err =
                              raw === "" && f.mandatory
                                ? "required"
                                : raw !== ""
                                  ? validateValue(type, raw)
                                  : null;
                            return (
                              <td key={f.name} className="px-1 py-0.5">
                                <input
                                  value={r[ci] ?? ""}
                                  onChange={(e) => setCell(di, ri, ci, e.target.value)}
                                  title={err ?? undefined}
                                  className={cn(
                                    "w-full min-w-[90px] rounded border bg-background px-1.5 py-1 font-mono outline-none focus:border-primary",
                                    err
                                      ? "border-danger/60 bg-danger/5"
                                      : "border-transparent hover:border-border",
                                  )}
                                />
                              </td>
                            );
                          })}
                          <td className="px-1">
                            <button
                              onClick={() => removeRow(di, ri)}
                              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-danger"
                              title="Remove row"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            {errorCount === 0 ? (
              <div className="flex items-start gap-2 rounded-lg border border-success/20 bg-success/10 px-3 py-2.5 text-sm text-success">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  All checks passed — {totalRows.toLocaleString()} rows are clean and ready to
                  import.
                </span>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2.5 text-sm text-danger">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {errorCount} cell{errorCount > 1 ? "s" : ""} need fixing (highlighted above) before
                  you can import.
                </span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={close}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
              >
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
              <button
                onClick={confirmAndSave}
                disabled={errorCount > 0 || totalRows === 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" /> Confirm & import
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
