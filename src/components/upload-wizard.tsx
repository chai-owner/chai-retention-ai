// Upload wizard overlay shown on the Data & Integrations (Uploads) screen.
// Walks the user through: pick a file -> review the column mapping ChAi
// inferred (and adjust it) -> fix any validation problems -> confirm & save.
// Validation runs entirely client-side so nothing is persisted until the data
// is clean and the user explicitly confirms.
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { PersonalizedDataset, PersonalizedField } from "@/lib/personalize-data";
import {
  uploadsStore,
  type FieldCheck,
  type QualityFinding,
  type UploadRecord,
} from "@/lib/uploads-store";
import { mergeTickets, formatDuration, type MergeSummary } from "@/lib/tickets-store";
import { ingestedStore } from "@/lib/ingested-data-store";
import { persistBatch } from "@/lib/ingest-persistence";

// ---------- CSV parsing ----------
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += c;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

// ---------- field type inference ----------
type FieldType = "date" | "number" | "email" | "text";

function inferType(field: PersonalizedField): FieldType {
  const n = field.name.toLowerCase();
  if (n.includes("email")) return "email";
  if (n.includes("date")) return "date";
  if (/^\d+(\.\d+)?$/.test(field.example.trim())) return "number";
  if (
    /(amount|revenue|score|logins|minutes|features_used|price|qty|quantity|count)/.test(n)
  )
    return "number";
  return "text";
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateValue(type: FieldType, raw: string): string | null {
  const v = raw.trim();
  if (v === "") return null; // emptiness handled separately for mandatory fields
  switch (type) {
    case "number":
      return /^-?\d+(\.\d+)?$/.test(v.replace(/[$,]/g, ""))
        ? null
        : `expected a number, got "${v}"`;
    case "date": {
      if (DATE_RE.test(v) && !isNaN(Date.parse(v))) return null;
      return `expected a date as YYYY-MM-DD, got "${v}"`;
    }
    case "email":
      return EMAIL_RE.test(v) ? null : `expected an email address, got "${v}"`;
    default:
      return null;
  }
}

// ---------- auto mapping ----------
function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function autoMap(headers: string[], fields: PersonalizedField[]): Record<string, string> {
  const map: Record<string, string> = {};
  const used = new Set<number>();
  for (const f of fields) {
    const target = norm(f.name);
    let bestIdx = -1;
    for (let i = 0; i < headers.length; i++) {
      if (used.has(i)) continue;
      const h = norm(headers[i]);
      if (h === target) {
        bestIdx = i;
        break;
      }
      if (bestIdx === -1 && (h.includes(target) || target.includes(h))) bestIdx = i;
    }
    if (bestIdx >= 0) {
      used.add(bestIdx);
      map[f.name] = headers[bestIdx];
    } else {
      map[f.name] = "";
    }
  }
  return map;
}

const UNMAPPED = "__none__";

interface ErrorRow {
  rowNumber: number; // 1-based data row (excludes header)
  field: string;
  column: string;
  message: string;
}

type Step = "select" | "review" | "done";

export function UploadWizard({
  dataset,
  open,
  onOpenChange,
}: {
  dataset: PersonalizedDataset;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("select");
  const [parsing, setParsing] = useState(false);
  const [fileName, setFileName] = useState("");
  const [fileSizeKb, setFileSizeKb] = useState(0);
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [mergeSummary, setMergeSummary] = useState<MergeSummary | null>(null);

  function reset() {
    setStep("select");
    setParsing(false);
    setFileName("");
    setFileSizeKb(0);
    setHeaders([]);
    setDataRows([]);
    setMapping({});
    setMergeSummary(null);
  }

  function close() {
    onOpenChange(false);
    setTimeout(reset, 200);
  }

  async function handleFile(file: File) {
    if (!/\.csv$/i.test(file.name)) {
      toast.error("Unsupported file", {
        description: "Please upload a .csv file. Export your spreadsheet as CSV first.",
      });
      return;
    }
    setParsing(true);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) {
        toast.error("Empty file", { description: "We couldn't find a header row and data rows." });
        setParsing(false);
        return;
      }
      const hdr = rows[0].map((h) => h.trim());
      setHeaders(hdr);
      setDataRows(rows.slice(1));
      setFileName(file.name);
      setFileSizeKb(Math.max(1, Math.round(file.size / 1024)));
      setMapping(autoMap(hdr, dataset.fields));
      setStep("review");
    } catch {
      toast.error("Could not read file", { description: "The file appears to be corrupted." });
    } finally {
      setParsing(false);
    }
  }

  // Validation derived from the current mapping.
  const { errors, fieldChecks, fill } = useMemo(() => {
    const errs: ErrorRow[] = [];
    const checks: FieldCheck[] = [];
    let filledCells = 0;
    let totalMandatoryCells = 0;

    for (const f of dataset.fields) {
      const col = mapping[f.name];
      const colIdx = col ? headers.indexOf(col) : -1;
      const type = inferType(f);
      let nonEmpty = 0;

      if (colIdx === -1) {
        if (f.mandatory) {
          errs.push({
            rowNumber: 0,
            field: f.name,
            column: "—",
            message: `mandatory field "${f.name}" is not mapped to any column`,
          });
        }
        checks.push({ field: f.name, mandatory: f.mandatory, fill: 0 });
        if (f.mandatory) totalMandatoryCells += dataRows.length;
        continue;
      }

      dataRows.forEach((r, i) => {
        const raw = (r[colIdx] ?? "").trim();
        if (raw === "") {
          if (f.mandatory) {
            errs.push({
              rowNumber: i + 1,
              field: f.name,
              column: col,
              message: `mandatory value is missing`,
            });
          }
        } else {
          nonEmpty++;
          const v = validateValue(type, raw);
          if (v)
            errs.push({ rowNumber: i + 1, field: f.name, column: col, message: v });
        }
      });

      const pct = dataRows.length ? Math.round((nonEmpty / dataRows.length) * 100) : 0;
      checks.push({ field: f.name, mandatory: f.mandatory, fill: pct });
      filledCells += nonEmpty;
      if (f.mandatory) totalMandatoryCells += dataRows.length;
    }

    const totalCells = dataRows.length * dataset.fields.length || 1;
    return {
      errors: errs,
      fieldChecks: checks,
      fill: Math.round((filledCells / totalCells) * 100),
    };
  }, [mapping, headers, dataRows, dataset.fields]);

  const errorsByRow = useMemo(() => {
    const sorted = [...errors].sort((a, b) => a.rowNumber - b.rowNumber);
    return sorted.slice(0, 50); // cap display
  }, [errors]);

  function confirmAndSave() {
    if (errors.length > 0) return;
    const reliability = Math.min(100, 70 + Math.round(fill / 4) + 8);
    const findings: QualityFinding[] = [
      { level: "info", text: "All mandatory fields are present and validated." },
      { level: "info", text: `${dataRows.length.toLocaleString()} rows passed date, numeric and email checks.` },
    ];
    const record: UploadRecord = {
      id: `up_${Date.now()}`,
      fileName,
      datasetKey: dataset.key,
      datasetLabel: dataset.label,
      uploadedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
      rows: dataRows.length,
      sizeKb: fileSizeKb,
      reliability,
      completeness: fill,
      findings,
      fieldChecks,
    };
    uploadsStore.add(record);

    // Capture the actual rows (mapped to schema fields) so ChAi can score
    // customers on real data.
    const rowObjects = dataRows.map((r) => {
      const obj: Record<string, string> = {};
      for (const f of dataset.fields) {
        const col = mapping[f.name];
        const idx = col ? headers.indexOf(col) : -1;
        obj[f.name] = idx >= 0 ? (r[idx] ?? "").trim() : "";
      }
      return obj;
    });
    ingestedStore.addRows(dataset.key, rowObjects);
    void persistBatch({
      source_kind: "upload",
      source_provider: "csv",
      dataset_key: dataset.key,
      filename: fileName,
      rows: rowObjects,
      meta: {
        datasetLabel: dataset.label,
        reliability,
        completeness: fill,
        sizeKb: fileSizeKb,
        findings,
        fieldChecks,
      },
    });


    // Support tickets: merge by ticket_id, overwriting on status change and
    // logging status history so we can measure time-to-close.
    if (dataset.key === "support") {
      const summary = mergeTickets(rowObjects);
      setMergeSummary(summary);
      toast.success("Support tickets updated", {
        description: `${summary.inserted} new · ${summary.updated} updated · ${summary.closed} newly closed.`,
      });
      setStep("done");
      return;
    }

    toast.success("Data saved", {
      description: `${dataset.label}: ${dataRows.length.toLocaleString()} clean rows imported into ChAi.`,
    });
    close();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload {dataset.label}</DialogTitle>
          <DialogDescription>
            {step === "select"
              ? "Choose a CSV file. ChAi will map your columns and check the data before anything is saved."
              : "Review the mapping and fix any problems. Nothing is saved until the data is clean."}
          </DialogDescription>
        </DialogHeader>

        {step === "select" && (
          <div className="py-2">
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => inputRef.current?.click()}
              disabled={parsing}
              className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border px-6 py-12 text-center transition-colors hover:border-primary/40 hover:bg-accent/40"
            >
              {parsing ? (
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              ) : (
                <Upload className="h-8 w-8 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">
                {parsing ? "Reading file…" : "Click to choose a CSV file"}
              </span>
              <span className="text-xs text-muted-foreground">
                Expected columns: {dataset.fields.map((f) => f.name).join(", ")}
              </span>
            </button>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-5 py-1">
            {/* File summary */}
            <div className="flex items-center gap-2 rounded-lg border border-border bg-accent/30 px-3 py-2 text-sm">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{fileName}</span>
              <span className="text-muted-foreground">
                · {dataRows.length.toLocaleString()} rows · {headers.length} columns
              </span>
            </div>

            {/* Mapping */}
            <div>
              <h4 className="text-sm font-semibold">Review field mapping</h4>
              <p className="mt-0.5 text-xs text-muted-foreground">
                ChAi matched your columns to the fields it needs. Change any that look wrong.
              </p>
              <div className="mt-3 divide-y divide-border rounded-lg border border-border">
                {dataset.fields.map((f) => (
                  <div
                    key={f.name}
                    className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium">{f.name}</span>
                      {f.mandatory && (
                        <span className="rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-semibold text-danger">
                          required
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground">{inferType(f)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ArrowRight className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" />
                      <Select
                        value={mapping[f.name] || UNMAPPED}
                        onValueChange={(v) =>
                          setMapping((m) => ({ ...m, [f.name]: v === UNMAPPED ? "" : v }))
                        }
                      >
                        <SelectTrigger className="h-8 w-56 text-xs">
                          <SelectValue placeholder="Not mapped" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNMAPPED}>Not mapped</SelectItem>
                          {headers.map((h) => (
                            <SelectItem key={h} value={h}>
                              {h}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Validation result */}
            {errors.length === 0 ? (
              <div className="flex items-start gap-2 rounded-lg border border-success/20 bg-success/10 px-3 py-2.5 text-sm text-success">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  All checks passed — {dataRows.length.toLocaleString()} rows are clean and ready to
                  save.
                </span>
              </div>
            ) : (
              <div className="rounded-lg border border-danger/20 bg-danger/5">
                <div className="flex items-center gap-2 border-b border-danger/15 px-3 py-2 text-sm font-medium text-danger">
                  <AlertTriangle className="h-4 w-4" />
                  {errors.length} problem{errors.length > 1 ? "s" : ""} found — fix these before
                  saving
                </div>
                <div className="max-h-56 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="px-3 py-1.5 font-medium">Row</th>
                        <th className="px-3 py-1.5 font-medium">Field</th>
                        <th className="px-3 py-1.5 font-medium">Column</th>
                        <th className="px-3 py-1.5 font-medium">Problem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {errorsByRow.map((e, i) => (
                        <tr key={i} className="border-t border-danger/10">
                          <td className="px-3 py-1.5 tabular-nums">
                            {e.rowNumber === 0 ? "—" : e.rowNumber}
                          </td>
                          <td className="px-3 py-1.5 font-mono">{e.field}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{e.column}</td>
                          <td className="px-3 py-1.5">{e.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {errors.length > errorsByRow.length && (
                    <p className="px-3 py-2 text-[11px] text-muted-foreground">
                      Showing first {errorsByRow.length} of {errors.length} problems.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => reset()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
              >
                <X className="h-3.5 w-3.5" /> Choose another file
              </button>
              <button
                onClick={confirmAndSave}
                disabled={errors.length > 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" /> Confirm & save data
              </button>
            </div>
          </div>
        )}

        {step === "done" && mergeSummary && (
          <div className="space-y-5 py-1">
            <div className="flex items-start gap-2 rounded-lg border border-success/20 bg-success/10 px-3 py-2.5 text-sm text-success">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Support tickets merged. Existing tickets were overwritten where the status changed.</span>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "New tickets", value: mergeSummary.inserted },
                { label: "Updated", value: mergeSummary.updated },
                { label: "Newly closed", value: mergeSummary.closed },
                { label: "Reopened", value: mergeSummary.reopened },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-border p-3 text-center">
                  <p className="text-2xl font-semibold tabular-nums">{s.value}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>

            {mergeSummary.avgResolutionHours != null && (
              <div className="rounded-lg border border-border bg-accent/30 px-3 py-2.5 text-sm">
                Average time to close for tickets closed in this upload:{" "}
                <span className="font-semibold">{formatDuration(mergeSummary.avgResolutionHours)}</span>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              See the full status-change history and resolution times on the Data Quality page.
            </p>

            <div className="flex justify-end">
              <button
                onClick={close}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <CheckCircle2 className="h-4 w-4" /> Done
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
