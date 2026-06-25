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

// Format a timestamp a given number of days/hours before now, so the seeded
// demo uploads always read as recent regardless of when the demo is viewed.
function recentDate(daysAgo: number, hour = 9, minute = 14): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

let uploads: UploadRecord[] = [
  {
    id: "up_001",
    fileName: "customers_latest.csv",
    datasetKey: "customers",
    datasetLabel: "Customers",
    uploadedAt: recentDate(2, 9, 14),
    rows: 433,
    sizeKb: 92,
    reliability: 95,
    completeness: 91,
    findings: [
      { level: "info", text: "All mandatory fields are present." },
      { level: "info", text: "98% of records have a monthly_revenue value." },
    ],
    fieldChecks: [
      { field: "customer_id", mandatory: true, fill: 100 },
      { field: "name", mandatory: true, fill: 100 },
      { field: "email", mandatory: true, fill: 99 },
      { field: "signup_date", mandatory: true, fill: 98 },
      { field: "monthly_revenue", mandatory: false, fill: 96 },
      { field: "plan", mandatory: false, fill: 88 },
      { field: "region", mandatory: false, fill: 74 },
    ],
  },
  {
    id: "up_002",
    fileName: "transactions_recent.xlsx",
    datasetKey: "transactions",
    datasetLabel: "Transactions",
    uploadedAt: recentDate(4, 16, 48),
    rows: 2041,
    sizeKb: 258,
    reliability: 90,
    completeness: 87,
    findings: [
      { level: "info", text: "All mandatory fields are present." },
      { level: "warning", text: "4% of rows reference a customer_id not in your customer list." },
    ],
    fieldChecks: [
      { field: "customer_id", mandatory: true, fill: 96 },
      { field: "transaction_id", mandatory: true, fill: 100 },
      { field: "amount", mandatory: true, fill: 100 },
      { field: "transaction_date", mandatory: true, fill: 99 },
      { field: "product", mandatory: false, fill: 82 },
      { field: "currency", mandatory: false, fill: 76 },
    ],
  },
  {
    id: "up_003",
    fileName: "support_tickets_recent.csv",
    datasetKey: "support",
    datasetLabel: "Support tickets",
    uploadedAt: recentDate(6, 11, 2),
    rows: 689,
    sizeKb: 118,
    reliability: 86,
    completeness: 82,
    findings: [
      { level: "info", text: "All mandatory fields are present." },
      { level: "warning", text: "satisfaction_score is present on 74% of tickets." },
      { level: "info", text: "No duplicate ticket_id values detected." },
    ],
    fieldChecks: [
      { field: "customer_id", mandatory: true, fill: 98 },
      { field: "ticket_id", mandatory: true, fill: 100 },
      { field: "created_date", mandatory: true, fill: 97 },
      { field: "status", mandatory: true, fill: 96 },
      { field: "category", mandatory: false, fill: 84 },
      { field: "satisfaction_score", mandatory: false, fill: 74 },
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
