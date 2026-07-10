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

// Starts empty — the upload history reflects only what the user actually
// brings in. No demo/sample uploads are seeded.
let uploads: UploadRecord[] = [];


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
