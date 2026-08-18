// Smart Data Ingestion overlay — accepts any supported document, sends it to
// the AI extraction server function, then shows an editable review screen
// grouped per detected dataset. Nothing is saved until the data is clean and
// the user confirms. Mirrors the validation behaviour of upload-wizard.tsx.
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Sparkles,
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
import { cn } from "@/lib/utils";
import { type DatasetSchema } from "@/lib/data-schemas";
import { useAllSchemas } from "@/lib/all-datasets";
import type { PlannerMetric } from "@/lib/mock-data";
import { extractRecords, mapColumns, type ExtractedDataset } from "@/lib/ingest.functions";
import { applyMapping, type MappedSchema } from "@/lib/ingest-mapping";
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

// CSV parse (shared shape with upload-wizard).
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
        } else inQuotes = false;
      } else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      resolve(res.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const SUPPORTED =
  ".pdf,.png,.jpg,.jpeg,.webp,.csv,.txt,.xlsx,.xls,application/pdf,image/png,image/jpeg,image/webp,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";

type Step = "select" | "review";

/** Rows shown in the review table; every row is still imported. */
const PREVIEW_ROWS = 50;

// Merge editable datasets from multiple files by dataset key, concatenating
// their rows so a folder of documents collapses into one review screen.
function mergeEditable(target: EditableDataset[], incoming: EditableDataset[]) {
  const byKey = new Map(target.map((d) => [d.key, d]));
  for (const d of incoming) {
    const existing = byKey.get(d.key);
    if (existing) {
      existing.rows = [...existing.rows, ...d.rows];
      existing.confidence = Math.round((existing.confidence + d.confidence) / 2);
      existing.derivations = [...new Set([...(existing.derivations ?? []), ...(d.derivations ?? [])])];
      existing.grouped = existing.grouped || d.grouped;
    } else {
      const copy = { ...d, rows: [...d.rows] };
      byKey.set(d.key, copy);
      target.push(copy);
    }
  }
  return target;
}

interface EditableDataset {
  key: string;
  label: string;
  schema: DatasetSchema;
  headers: string[];
  rows: string[][];
  confidence: number;
  note: string;
  derivations?: string[];
  grouped?: boolean;
}


function buildEditable(
  extracted: ExtractedDataset[],
  schemas: DatasetSchema[],
): EditableDataset[] {
  const out: EditableDataset[] = [];
  for (const d of extracted) {
    const schema = schemas.find((s) => s.key === d.key);
    if (!schema) continue;
    // Normalize to the schema's field order so validation lines up.
    const headers = schema.fields.map((f) => f.name);
    const idxFor = (name: string) =>
      d.headers.findIndex((h) => h.toLowerCase().replace(/[^a-z0-9]/g, "") === name.toLowerCase().replace(/[^a-z0-9]/g, ""));
    const rows = d.rows.map((r) =>
      headers.map((h) => {
        const i = idxFor(h);
        return i >= 0 ? (r[i] ?? "") : "";
      }),
    );
    out.push({ key: d.key, label: d.label, schema, headers, rows, confidence: d.confidence, note: d.note });
  }
  return out;
}

export function SmartIngestWizard({
  open,
  onOpenChange,
  metrics,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  metrics?: PlannerMetric[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const runExtract = useServerFn(extractRecords);
  const runMapColumns = useServerFn(mapColumns);
  const allSchemas = useAllSchemas(metrics);
  const [step, setStep] = useState<Step>("select");
  const [busy, setBusy] = useState(false);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [fileSizeKb, setFileSizeKb] = useState(0);
  const [documentType, setDocumentType] = useState("");
  const [datasets, setDatasets] = useState<EditableDataset[]>([]);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  /** Data rows found in the source spreadsheet(s); 0 for PDFs/images. */
  const [sourceRows, setSourceRows] = useState(0);

  const sourceLabel =
    fileNames.length === 1 ? fileNames[0] : `${fileNames.length} files`;

  function reset() {
    setStep("select");
    setBusy(false);
    setFileNames([]);
    setFileSizeKb(0);
    setDocumentType("");
    setDatasets([]);
    setProgress(null);
    setSourceRows(0);
  }
  function close() {
    onOpenChange(false);
    setTimeout(reset, 200);
  }

  // Structured files (CSV / Excel) are parsed locally and mapped column-by-column
  // by the AI, then applied to EVERY row here — so the import can never be
  // truncated to the first customer. PDFs/images still go through AI extraction.
  async function processStructured(
    file: File,
    grid: string[][],
    schemas: ReturnType<typeof buildSchemas>,
  ): Promise<{ datasets: EditableDataset[]; documentType: string; sourceRows: number } | null> {
    const headers = grid[0] ?? [];
    const dataRows = grid.slice(1);
    if (headers.length === 0 || dataRows.length === 0) {
      toast.error(`No rows in ${file.name}`, { description: "The file needs a header row and at least one data row." });
      return null;
    }

    const result = await runMapColumns({
      data: {
        fileName: file.name,
        headers,
        sampleRows: dataRows.slice(0, 20),
        totalRows: dataRows.length,
        schemas,
      },
    });

    const mappedSchemas: MappedSchema[] = allSchemas.map((s) => ({
      key: s.key,
      label: s.label,
      fields: s.fields.map((f) => ({ name: f.name, type: inferType(f.name, f.example) })),
    }));

    const mapped = applyMapping(headers, dataRows, mappedSchemas, result.mappings);
    const editable: EditableDataset[] = mapped.flatMap((m) => {
      const schema = allSchemas.find((s) => s.key === m.key);
      if (!schema) return [];
      return [{ ...m, schema }];
    });
    return { datasets: editable, documentType: result.documentType, sourceRows: dataRows.length };
  }

  // Extract one file. Returns review-ready datasets, or null (with a toast)
  // when the file is unsupported or yields nothing.
  async function extractOne(
    file: File,
    schemas: ReturnType<typeof buildSchemas>,
  ): Promise<{ datasets: EditableDataset[]; documentType: string; sourceRows: number } | null> {
    const name = file.name.toLowerCase();

    if (/\.(csv|txt)$/.test(name)) {
      return processStructured(file, parseCsv(await file.text()), schemas);
    }
    if (/\.(xlsx|xls)$/.test(name)) {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      return processStructured(file, parseCsv(XLSX.utils.sheet_to_csv(sheet)), schemas);
    }
    if (!/\.(pdf|png|jpe?g|webp)$/.test(name)) {
      toast.error(`Skipped ${file.name}`, {
        description: "Unsupported type. Use PDF, image, CSV, TXT or Excel.",
      });
      return null;
    }

    const mimeType = file.type || (name.endsWith(".pdf") ? "application/pdf" : "image/png");
    const result = await runExtract({
      data: { fileName: file.name, mimeType, schemas, base64: await fileToBase64(file) },
    });
    return {
      datasets: buildEditable(result.datasets, allSchemas),
      documentType: result.documentType,
      sourceRows: 0,
    };
  }

  function buildSchemas() {
    return allSchemas.map((s) => ({
      key: s.key,
      label: s.label,
      description: s.description,
      fields: s.fields.map((f) => ({
        name: f.name,
        mandatory: f.mandatory,
        type: inferType(f.name, f.example),
        description: f.description,
        example: f.example,
        identifier: f.identifier ?? false,
      })),
    }));
  }

  async function handleFiles(files: File[]) {
    if (files.length === 0) return;
    setBusy(true);
    setProgress({ current: 0, total: files.length });
    try {
      const schemas = buildSchemas();
      const merged: EditableDataset[] = [];
      const usedNames: string[] = [];
      const docTypes = new Set<string>();
      let sizeKb = 0;
      let srcRows = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress({ current: i + 1, total: files.length });
        try {
          const result = await extractOne(file, schemas);
          if (!result) continue;
          const editable = result.datasets;
          if (editable.length === 0) {
            toast.error(`No data in ${file.name}`, {
              description: "ChAi couldn't match this file to your datasets.",
            });
            continue;
          }
          mergeEditable(merged, editable);
          usedNames.push(file.name);
          docTypes.add(result.documentType);
          srcRows += result.sourceRows;
          sizeKb += Math.max(1, Math.round(file.size / 1024));
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Extraction failed.";
          if (/rate|429/.test(msg)) {
            toast.error("AI is busy", { description: `Rate limit hit on ${file.name} — try again shortly.` });
          } else if (/402|credit/i.test(msg)) {
            toast.error("AI credits exhausted", { description: "Add credits to keep using ChAi Data Drop." });
            break;
          } else {
            toast.error(`Could not read ${file.name}`, { description: msg });
          }
        }
      }

      if (merged.length === 0) {
        toast.error("Nothing to import", {
          description: "None of the selected files produced data for your datasets.",
        });
        setBusy(false);
        setProgress(null);
        return;
      }

      setFileNames(usedNames);
      setFileSizeKb(sizeKb);
      setDocumentType(docTypes.size === 1 ? [...docTypes][0] : `${docTypes.size} document types`);
      setDatasets(merged);
      setSourceRows(srcRows);
      setStep("review");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }


  function setCell(dsIdx: number, rowIdx: number, colIdx: number, value: string) {
    setDatasets((prev) =>
      prev.map((d, di) =>
        di === dsIdx
          ? { ...d, rows: d.rows.map((r, ri) => (ri === rowIdx ? r.map((c, ci) => (ci === colIdx ? value : c)) : r)) }
          : d,
      ),
    );
  }
  function removeRow(dsIdx: number, rowIdx: number) {
    setDatasets((prev) =>
      prev.map((d, di) => (di === dsIdx ? { ...d, rows: d.rows.filter((_, ri) => ri !== rowIdx) } : d)),
    );
  }

  // Validation across all datasets.
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
  const maxDatasetRows = datasets.reduce((a, d) => Math.max(a, d.rows.length), 0);

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
        { level: "info", text: `Extracted by ChAi Data Drop from ${sourceLabel} (${documentType}).` },
        { level: "info", text: `${d.rows.length.toLocaleString()} rows passed validation.` },
      ];
      const record: UploadRecord = {
        id: `ing_${Date.now()}_${d.key}`,
        fileName: sourceLabel,
        datasetKey: d.key,
        datasetLabel: d.label,
        uploadedAt,
        rows: d.rows.length,
        sizeKb: fileSizeKb,
        reliability,
        completeness,
        findings,
        fieldChecks,
      };
      uploadsStore.add(record);
      const rowObjects = tagSource(rowsToObjects(d.schema.fields.map((f) => f.name), d.rows), "drop");
      ingestedStore.addRows(d.key, rowObjects);
      void persistBatch({
        localUploadId: record.id,
        source_kind: "drop",
        source_provider: documentType || "drop",
        dataset_key: d.key,
        filename: sourceLabel,
        rows: rowObjects,
        meta: { datasetLabel: d.label, reliability, completeness, sizeKb: fileSizeKb, findings, fieldChecks },
      });
    }
    toast.success("Data imported", {
      description: `${totalRows.toLocaleString()} rows across ${datasets.length} dataset${datasets.length > 1 ? "s" : ""} added to ChAi.`,
    });
    close();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> ChAi Data Drop
          </DialogTitle>
          <DialogDescription>
            {step === "select"
              ? "Drop in any document — a scanned invoice, PDF, spreadsheet or text file. ChAi's AI reads it and maps the data into your datasets."
              : "Review what ChAi extracted, fix anything that looks off, then confirm. Nothing is saved until the data is clean."}
          </DialogDescription>
        </DialogHeader>

        {step === "select" && (
          <div className="py-2">
            <input
              ref={inputRef}
              type="file"
              accept={SUPPORTED}
              multiple
              className="hidden"
              onChange={(e) => {
                const fs = Array.from(e.target.files ?? []);
                if (fs.length) handleFiles(fs);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border px-6 py-12 text-center transition-colors hover:border-primary/40 hover:bg-accent/40"
            >
              {busy ? (
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              ) : (
                <Upload className="h-8 w-8 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">
                {busy
                  ? progress
                    ? `Reading document ${progress.current} of ${progress.total} with AI…`
                    : "Reading your documents with AI…"
                  : "Click to choose documents"}
              </span>
              <span className="text-xs text-muted-foreground">
                Select one file or a whole folder's worth at once — PDF, images
                (invoices/receipts), Excel, CSV or text. Export Word & Google Docs as PDF first.
              </span>
            </button>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-5 py-1">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-accent/30 px-3 py-2 text-sm">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{sourceLabel}</span>
              <span className="text-muted-foreground">· detected as {documentType}</span>
              {sourceRows > 0 && (
                <span className="text-muted-foreground">
                  · {maxDatasetRows.toLocaleString()} of {sourceRows.toLocaleString()} rows in file mapped
                </span>
              )}
            </div>

            {datasets.map((d, di) => (
              <div key={d.key} className="rounded-lg border border-border">
                <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                  <div>
                    <span className="text-sm font-semibold">{d.label}</span>
                    {(d.derivations?.length ?? 0) > 0 && (
                      <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                        Calculated
                      </span>
                    )}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {d.grouped && sourceRows > 0
                        ? `${sourceRows.toLocaleString()} rows → ${d.rows.length.toLocaleString()} customer${d.rows.length !== 1 ? "s" : ""}`
                        : `${d.rows.length.toLocaleString()} row${d.rows.length !== 1 ? "s" : ""}`}
                      {d.rows.length > PREVIEW_ROWS ? ` · showing first ${PREVIEW_ROWS}` : ""}
                    </span>
                    {(d.derivations?.length ?? 0) > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {d.derivations!.map((line) => (
                          <p key={line} className="text-[11px] text-muted-foreground">
                            Calculated — {line}
                            {d.grouped ? "" : ""}
                          </p>
                        ))}
                      </div>
                    )}
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
                      {d.rows.slice(0, PREVIEW_ROWS).map((r, ri) => (
                        <tr key={ri} className="border-t border-border">
                          {d.schema.fields.map((f, ci) => {
                            const type = inferType(f.name, f.example);
                            const raw = (r[ci] ?? "").trim();
                            const err = raw === "" && f.mandatory ? "required" : raw !== "" ? validateValue(type, raw) : null;
                            return (
                              <td key={f.name} className="px-1 py-0.5">
                                <input
                                  value={r[ci] ?? ""}
                                  onChange={(e) => setCell(di, ri, ci, e.target.value)}
                                  title={err ?? undefined}
                                  className={cn(
                                    "w-full min-w-[90px] rounded border bg-background px-1.5 py-1 font-mono outline-none focus:border-primary",
                                    err ? "border-danger/60 bg-danger/5" : "border-transparent hover:border-border",
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
                  {d.rows.length > PREVIEW_ROWS && (
                    <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                      + {(d.rows.length - PREVIEW_ROWS).toLocaleString()} more rows — all of them will be imported.
                    </div>
                  )}
                </div>
              </div>
            ))}

            {errorCount === 0 ? (
              <div className="flex items-start gap-2 rounded-lg border border-success/20 bg-success/10 px-3 py-2.5 text-sm text-success">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>All checks passed — {totalRows.toLocaleString()} rows are clean and ready to import.</span>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2.5 text-sm text-danger">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {errorCount} cell{errorCount > 1 ? "s" : ""} need fixing (highlighted above) before you can import.
                </span>
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <button
                onClick={reset}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
              >
                <X className="h-3.5 w-3.5" /> Choose another file
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
