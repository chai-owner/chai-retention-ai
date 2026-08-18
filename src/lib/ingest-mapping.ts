// Deterministic column mapping for already-structured uploads (CSV / Excel).
//
// The AI only decides WHICH spreadsheet column feeds which dataset field; ChAi
// then applies that mapping to every parsed row locally. This keeps the import
// row count exactly equal to the file's row count — the model never has to
// re-type the data, so it can never truncate or summarise it.

/**
 * A calculation ChAi can perform locally over the parsed file. The operation
 * list is closed — no free-form formulas are ever evaluated.
 *
 * Row ops produce one value per file row; group ops roll many rows up into one
 * value per customer (used when the dataset mapping carries `groupBy`).
 */
export type DeriveSpec =
  // --- row-level ------------------------------------------------------------
  | { op: "arith"; a: string; b?: string; operator: "+" | "-" | "*" | "/"; value?: number }
  | { op: "date_diff"; from: string; to: string }
  | { op: "days_since"; column: string }
  | { op: "bool"; column: string; trueValues?: string[] }
  | { op: "lookup"; column: string; map: Record<string, string>; fallback?: string }
  // --- group-level ----------------------------------------------------------
  | { op: "count" }
  | { op: "count_if"; column: string; equals?: string; anyOf?: string[] }
  | { op: "sum" | "avg" | "min" | "max"; column: string }
  | { op: "last_date"; column: string }
  | { op: "days_since_last"; column: string }
  | { op: "ratio_if"; column: string; equals?: string; anyOf?: string[] };

export const GROUP_OPS = new Set([
  "count",
  "count_if",
  "sum",
  "avg",
  "min",
  "max",
  "last_date",
  "days_since_last",
  "ratio_if",
]);

export function isGroupOp(spec: DeriveSpec | undefined): boolean {
  return !!spec && GROUP_OPS.has(spec.op);
}

export interface MappingField {
  /** Dataset field name. */
  field: string;
  /** Source column header from the file, or "" when unmapped. */
  column: string;
  /** Optional fixed value applied to every row (e.g. a document date). */
  constant?: string;
  /** Optional calculation used instead of a direct column. */
  derive?: DeriveSpec;
}

export interface DatasetMapping {
  key: string;
  confidence: number;
  note: string;
  fields: MappingField[];
  /** When set, rows are rolled up per value of this source column. */
  groupBy?: string;
}

export interface MappedSchemaField {
  name: string;
  type: "date" | "number" | "email" | "text";
}

export interface MappedSchema {
  key: string;
  label: string;
  fields: MappedSchemaField[];
}

export interface MappedDataset {
  key: string;
  label: string;
  headers: string[];
  rows: string[][];
  confidence: number;
  note: string;
  /** Plain-English provenance lines for fields that were calculated. */
  derivations: string[];
  /** True when rows were rolled up per customer. */
  grouped: boolean;
}


const normKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** Best-effort normalisation to YYYY-MM-DD; returns the input when unsure. */
export function normalizeDate(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  let m = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/.exec(v);
  if (m) return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
  // DD/MM/YYYY or MM/DD/YYYY — prefer DD/MM unless the first part can't be a day.
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
  if (m) {
    let d = Number(m[1]);
    let mo = Number(m[2]);
    if (d > 12 && mo <= 12) {
      // already day-first
    } else if (mo > 12 && d <= 12) {
      [d, mo] = [mo, d];
    }
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${m[3]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  m = /^(\d{1,2})[ -]([a-zA-Z]{3,})[ -](\d{4})$/.exec(v);
  if (m) {
    const mo = MONTHS[m[2]!.slice(0, 3).toLowerCase()];
    if (mo) return `${m[3]}-${mo}-${m[1]!.padStart(2, "0")}`;
  }
  m = /^([a-zA-Z]{3,})[ -](\d{1,2}),?[ ](\d{4})$/.exec(v);
  if (m) {
    const mo = MONTHS[m[1]!.slice(0, 3).toLowerCase()];
    if (mo) return `${m[3]}-${mo}-${m[2]!.padStart(2, "0")}`;
  }
  const t = Date.parse(v);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return v;
}

/** Strip currency symbols, thousands separators and stray spaces. */
export function normalizeNumber(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  const cleaned = v.replace(/[^\d.,()-]/g, "").replace(/,(?=\d{3}\b)/g, "");
  const neg = /^\(.*\)$/.test(cleaned);
  const body = cleaned.replace(/[()]/g, "").replace(/,/g, "");
  if (!/^-?\d*\.?\d+$/.test(body)) return v;
  return neg ? `-${body}` : body;
}

function normalizeCell(type: MappedSchemaField["type"], raw: string): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  if (type === "date") return normalizeDate(v);
  if (type === "number") return normalizeNumber(v);
  if (type === "email") return v.toLowerCase();
  return v;
}

/**
 * Apply AI-produced column mappings to EVERY data row of the parsed file.
 * Rows where nothing mapped resolves to a value are dropped.
 */
export function applyMapping(
  headers: string[],
  rows: string[][],
  schemas: MappedSchema[],
  mappings: DatasetMapping[],
): MappedDataset[] {
  const headerIndex = new Map<string, number>();
  headers.forEach((h, i) => {
    const k = normKey(h);
    if (k && !headerIndex.has(k)) headerIndex.set(k, i);
  });

  const out: MappedDataset[] = [];
  for (const mapping of mappings) {
    const schema = schemas.find((s) => s.key === mapping.key);
    if (!schema) continue;

    const plan = schema.fields.map((f) => {
      const mf = mapping.fields.find((x) => normKey(x.field) === normKey(f.name));
      const idx = mf?.column ? (headerIndex.get(normKey(mf.column)) ?? -1) : -1;
      return { type: f.type, idx, constant: mf?.constant?.trim() ?? "" };
    });

    if (plan.every((p) => p.idx < 0 && !p.constant)) continue;

    const built: string[][] = [];
    for (const row of rows) {
      const values = plan.map((p) => {
        const raw = p.idx >= 0 ? (row[p.idx] ?? "") : p.constant;
        return normalizeCell(p.type, raw);
      });
      if (values.some((v) => v !== "")) built.push(values);
    }
    if (built.length === 0) continue;

    out.push({
      key: schema.key,
      label: schema.label,
      headers: schema.fields.map((f) => f.name),
      rows: built,
      confidence: Math.round(mapping.confidence),
      note: mapping.note,
    });
  }
  return out;
}
