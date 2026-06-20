// Lightweight in-memory store for uploaded data files. Powers both the upload
// history on the Data page and the dedicated Data Quality page. Uses
// useSyncExternalStore so every screen stays in sync, including after deletes.
import { useSyncExternalStore } from "react";

export interface QualityFinding {
  level: "warning" | "info" | "critical";
  text: string;
}

export interface FieldCheck {
  field: string;
  mandatory: boolean;
  fill: number; // % of rows with a value
}

export interface UploadRecord {
  id: string;
  fileName: string;
  datasetKey: string;
  datasetLabel: string;
  uploadedAt: string;
  rows: number;
  sizeKb: number;
  reliability: number;
  completeness: number;
  findings: QualityFinding[];
  fieldChecks: FieldCheck[];
}

export function overallScore(u: UploadRecord) {
  return Math.round((u.reliability + u.completeness) / 2);
}

let uploads: UploadRecord[] = [
  {
    id: "up_001",
    fileName: "customers_may_2025.csv",
    datasetKey: "customers",
    datasetLabel: "Customers",
    uploadedAt: "2025-05-22 09:14",
    rows: 412,
    sizeKb: 88,
    reliability: 92,
    completeness: 86,
    findings: [
      { level: "info", text: "All mandatory fields are present." },
      { level: "warning", text: "9% of records have no monthly_revenue value." },
      { level: "info", text: "6% of signup dates are in the future and were flagged." },
    ],
    fieldChecks: [
      { field: "customer_id", mandatory: true, fill: 100 },
      { field: "name", mandatory: true, fill: 100 },
      { field: "email", mandatory: true, fill: 98 },
      { field: "signup_date", mandatory: true, fill: 94 },
      { field: "monthly_revenue", mandatory: false, fill: 91 },
      { field: "plan", mandatory: false, fill: 70 },
      { field: "region", mandatory: false, fill: 52 },
    ],
  },
  {
    id: "up_002",
    fileName: "transactions_q2.xlsx",
    datasetKey: "transactions",
    datasetLabel: "Transactions",
    uploadedAt: "2025-05-20 16:48",
    rows: 1894,
    sizeKb: 240,
    reliability: 81,
    completeness: 78,
    findings: [
      { level: "warning", text: "12% of rows reference a customer_id not in your customer list." },
      { level: "info", text: "Currency defaulted to USD where missing." },
    ],
    fieldChecks: [
      { field: "customer_id", mandatory: true, fill: 88 },
      { field: "transaction_id", mandatory: true, fill: 100 },
      { field: "amount", mandatory: true, fill: 99 },
      { field: "transaction_date", mandatory: true, fill: 97 },
      { field: "product", mandatory: false, fill: 64 },
      { field: "currency", mandatory: false, fill: 41 },
    ],
  },
  {
    id: "up_003",
    fileName: "support_tickets.csv",
    datasetKey: "support",
    datasetLabel: "Support tickets",
    uploadedAt: "2025-05-18 11:02",
    rows: 623,
    sizeKb: 102,
    reliability: 58,
    completeness: 49,
    findings: [
      { level: "critical", text: "Mandatory field 'status' is missing in 22% of rows." },
      { level: "warning", text: "satisfaction_score is only present on 31% of tickets." },
      { level: "info", text: "Duplicate ticket_id values detected on 14 rows." },
    ],
    fieldChecks: [
      { field: "customer_id", mandatory: true, fill: 90 },
      { field: "ticket_id", mandatory: true, fill: 98 },
      { field: "created_date", mandatory: true, fill: 85 },
      { field: "status", mandatory: true, fill: 78 },
      { field: "category", mandatory: false, fill: 60 },
      { field: "satisfaction_score", mandatory: false, fill: 31 },
    ],
  },
];

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

export const uploadsStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  getSnapshot() {
    return uploads;
  },
  remove(id: string) {
    uploads = uploads.filter((u) => u.id !== id);
    emit();
  },
  add(record: UploadRecord) {
    uploads = [record, ...uploads];
    emit();
  },
};

export function useUploads() {
  return useSyncExternalStore(uploadsStore.subscribe, uploadsStore.getSnapshot, uploadsStore.getSnapshot);
}
