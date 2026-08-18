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

// --- derivation helpers ----------------------------------------------------

const num = (raw: string): number | null => {
  const n = Number(normalizeNumber(raw ?? ""));
  return Number.isFinite(n) ? n : null;
};

const toDate = (raw: string): number | null => {
  const iso = normalizeDate(raw ?? "");
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(t) ? null : t;
};

const DAY = 86400000;

const TRUTHY = new Set(["1", "true", "yes", "y", "t", "no-show", "noshow", "dna", "missed", "did not attend"]);

const truthy = (raw: string, extra?: string[]): boolean => {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return false;
  if (extra && extra.length > 0) return extra.some((e) => e.trim().toLowerCase() === v);
  const n = Number(v);
  if (Number.isFinite(n)) return n > 0;
  return TRUTHY.has(v);
};

const matches = (raw: string, equals?: string, anyOf?: string[]): boolean => {
  const v = (raw ?? "").trim().toLowerCase();
  if (anyOf && anyOf.length > 0) return anyOf.some((a) => a.trim().toLowerCase() === v);
  if (equals != null) return v === equals.trim().toLowerCase();
  return truthy(raw);
};

const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

/** Evaluate a row-level derivation against a single file row. "" when unknown. */
export function evalRowOp(
  spec: DeriveSpec,
  row: string[],
  col: (name: string) => number,
  now = Date.now(),
): string {
  const get = (name?: string) => (name ? (row[col(name)] ?? "") : "");
  switch (spec.op) {
    case "arith": {
      const a = num(get(spec.a));
      const b = spec.b ? num(get(spec.b)) : (spec.value ?? null);
      if (a == null || b == null) return "";
      if (spec.operator === "+") return fmt(a + b);
      if (spec.operator === "-") return fmt(a - b);
      if (spec.operator === "*") return fmt(a * b);
      return b === 0 ? "" : fmt(a / b);
    }
    case "date_diff": {
      const from = toDate(get(spec.from));
      const to = toDate(get(spec.to));
      if (from == null || to == null) return "";
      return fmt(Math.round((to - from) / DAY));
    }
    case "days_since": {
      const d = toDate(get(spec.column));
      if (d == null) return "";
      return fmt(Math.max(0, Math.round((now - d) / DAY)));
    }
    case "bool":
      return get(spec.column).trim() === "" ? "" : truthy(get(spec.column), spec.trueValues) ? "1" : "0";
    case "lookup": {
      const v = get(spec.column).trim();
      if (!v) return "";
      const hit = Object.entries(spec.map).find(([k]) => k.trim().toLowerCase() === v.toLowerCase());
      return hit ? hit[1] : (spec.fallback ?? "");
    }
    default:
      return "";
  }
}

/** Evaluate a group-level derivation across all rows for one customer. */
export function evalGroupOp(
  spec: DeriveSpec,
  group: string[][],
  col: (name: string) => number,
  now = Date.now(),
): string {
  const vals = (name: string) => group.map((r) => r[col(name)] ?? "");
  switch (spec.op) {
    case "count":
      return String(group.length);
    case "count_if":
      return String(vals(spec.column).filter((v) => matches(v, spec.equals, spec.anyOf)).length);
    case "ratio_if": {
      if (group.length === 0) return "";
      const hits = vals(spec.column).filter((v) => matches(v, spec.equals, spec.anyOf)).length;
      return fmt((hits / group.length) * 100);
    }
    case "sum":
    case "avg":
    case "min":
    case "max": {
      const ns = vals(spec.column).map(num).filter((n): n is number => n != null);
      if (ns.length === 0) return "";
      if (spec.op === "sum") return fmt(ns.reduce((a, b) => a + b, 0));
      if (spec.op === "avg") return fmt(ns.reduce((a, b) => a + b, 0) / ns.length);
      if (spec.op === "min") return fmt(Math.min(...ns));
      return fmt(Math.max(...ns));
    }
    case "last_date": {
      const ds = vals(spec.column).map(toDate).filter((d): d is number => d != null);
      if (ds.length === 0) return "";
      return new Date(Math.max(...ds)).toISOString().slice(0, 10);
    }
    case "days_since_last": {
      const ds = vals(spec.column).map(toDate).filter((d): d is number => d != null);
      if (ds.length === 0) return "";
      return fmt(Math.max(0, Math.round((now - Math.max(...ds)) / DAY)));
    }
    default:
      return "";
  }
}

/** Plain-English description of a derivation, for the review screen. */
export function describeDerive(spec: DeriveSpec, field: string): string {
  const cond = (c: { column: string; equals?: string; anyOf?: string[] }) =>
    c.anyOf && c.anyOf.length > 0
      ? `${c.column} is one of ${c.anyOf.join(", ")}`
      : c.equals != null
        ? `${c.column} = ${c.equals}`
        : `${c.column} is yes/true`;
  switch (spec.op) {
    case "arith":
      return `${field}: ${spec.a} ${spec.operator} ${spec.b ?? spec.value}`;
    case "date_diff":
      return `${field}: days between ${spec.from} and ${spec.to}`;
    case "days_since":
      return `${field}: days since ${spec.column}`;
    case "bool":
      return `${field}: ${spec.column} converted to 1/0`;
    case "lookup":
      return `${field}: ${spec.column} mapped to a score`;
    case "count":
      return `${field}: number of rows per customer`;
    case "count_if":
      return `${field}: count of rows where ${cond(spec)}, per customer`;
    case "ratio_if":
      return `${field}: % of rows where ${cond(spec)}, per customer`;
    case "sum":
      return `${field}: total of ${spec.column} per customer`;
    case "avg":
      return `${field}: average ${spec.column} per customer`;
    case "min":
      return `${field}: lowest ${spec.column} per customer`;
    case "max":
      return `${field}: highest ${spec.column} per customer`;
    case "last_date":
      return `${field}: most recent ${spec.column} per customer`;
    case "days_since_last":
      return `${field}: days since the last ${spec.column} per customer`;
    default:
      return field;
  }
}

/**
 * Apply AI-produced column mappings to EVERY data row of the parsed file.
 * Fields may be taken straight from a column, fixed to a constant, or
 * calculated (per row, or rolled up per customer when `groupBy` is set).
 * Rows where nothing resolves to a value are dropped.
 */
export function applyMapping(
  headers: string[],
  rows: string[][],
  schemas: MappedSchema[],
  mappings: DatasetMapping[],
  now = Date.now(),
): MappedDataset[] {
  const headerIndex = new Map<string, number>();
  headers.forEach((h, i) => {
    const k = normKey(h);
    if (k && !headerIndex.has(k)) headerIndex.set(k, i);
  });
  const col = (name: string) => headerIndex.get(normKey(name ?? "")) ?? -1;

  const out: MappedDataset[] = [];
  for (const mapping of mappings) {
    const schema = schemas.find((s) => s.key === mapping.key);
    if (!schema) continue;

    const plan = schema.fields.map((f) => {
      const mf = mapping.fields.find((x) => normKey(x.field) === normKey(f.name));
      const idx = mf?.column ? col(mf.column) : -1;
      return {
        name: f.name,
        type: f.type,
        idx,
        constant: mf?.constant?.trim() ?? "",
        derive: mf?.derive,
      };
    });

    if (plan.every((p) => p.idx < 0 && !p.constant && !p.derive)) continue;

    const derivations = plan
      .filter((p) => p.derive)
      .map((p) => describeDerive(p.derive!, p.name));

    const groupIdx = mapping.groupBy ? col(mapping.groupBy) : -1;
    const grouped = groupIdx >= 0 && plan.some((p) => isGroupOp(p.derive));

    const built: string[][] = [];

    if (grouped) {
      const groups = new Map<string, string[][]>();
      for (const row of rows) {
        const gk = (row[groupIdx] ?? "").trim();
        if (!gk) continue;
        const bucket = groups.get(gk.toLowerCase());
        if (bucket) bucket.push(row);
        else groups.set(gk.toLowerCase(), [row]);
      }
      for (const group of groups.values()) {
        const last = group[group.length - 1]!;
        const values = plan.map((p) => {
          let raw: string;
          if (p.derive && isGroupOp(p.derive)) raw = evalGroupOp(p.derive, group, col, now);
          else if (p.derive) raw = evalRowOp(p.derive, last, col, now);
          else if (p.idx >= 0) {
            // Prefer the first non-empty value in the group for pass-through fields.
            raw = group.map((r) => (r[p.idx] ?? "").trim()).find((v) => v !== "") ?? "";
            if (p.type === "date") {
              const ds = group.map((r) => r[p.idx] ?? "").map(toDate).filter((d): d is number => d != null);
              if (ds.length > 0) raw = new Date(Math.max(...ds)).toISOString().slice(0, 10);
            }
          } else raw = p.constant;
          return normalizeCell(p.type, raw);
        });
        if (values.some((v) => v !== "")) built.push(values);
      }
    } else {
      for (const row of rows) {
        const values = plan.map((p) => {
          const raw = p.derive
            ? evalRowOp(p.derive, row, col, now)
            : p.idx >= 0
              ? (row[p.idx] ?? "")
              : p.constant;
          return normalizeCell(p.type, raw);
        });
        if (values.some((v) => v !== "")) built.push(values);
      }
    }
    if (built.length === 0) continue;

    out.push({
      key: schema.key,
      label: schema.label,
      headers: schema.fields.map((f) => f.name),
      rows: built,
      confidence: Math.round(mapping.confidence),
      note: mapping.note,
      derivations,
      grouped,
    });
  }

  return out;
}
