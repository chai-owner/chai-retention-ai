// Minimal local type declarations, extracted from the parts of
// src/lib/ingest.functions.ts, src/lib/mock-data.ts and
// src/lib/ingested-data-store.ts that the cron jobs actually use. The full
// files (AI extraction, demo-data generation, React store) are UI/AI-side
// code and were intentionally not ported.

export interface ExtractedDataset {
  key: string;
  label: string;
  headers: string[];
  rows: string[][];
  confidence: number;
  note: string;
}

export interface PlannerMetric {
  name: string;
  why: string;
  churn: string;
  category: string;
  cadence?: string;
  benchmark?: string;
  benchmarkScore?: number;
  unit?: string;
  prefix?: string;
  decimals?: number;
  valueAt0?: number;
  valueAt100?: number;
  reason?: string;
  weight?: number;
}

export type IngestRow = Record<string, string>;
export type IngestedData = Record<string, IngestRow[]>;

export const SOURCE_FIELD = "__source";
export const UNKNOWN_SOURCE = "unknown";
