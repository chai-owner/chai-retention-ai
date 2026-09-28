// Writes nightly run-log entries as each step finishes, so results survive
// even though the scheduler stops waiting for the reply after 5 seconds.
// Writing is best-effort: a logging failure never breaks the sync itself.
import { retentionCutoff, sanitizeEntry, type RunLogEntry } from "./run-log";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export interface RunLogger {
  runId: string;
  record(entry: RunLogEntry): Promise<void>;
  purgeOld(): Promise<void>;
}

export function createRunLogger(db: Db, job: string): RunLogger {
  const runId = crypto.randomUUID();
  return {
    runId,
    async record(entry) {
      try {
        const now = new Date().toISOString();
        const clean = sanitizeEntry(entry);
        const { error } = await db.from("nightly_run_log").insert({
          ...clean,
          run_id: runId,
          job,
          started_at: clean.started_at ?? now,
          finished_at: clean.finished_at ?? now,
        });
        if (error) console.error("nightly_run_log insert failed");
      } catch {
        console.error("nightly_run_log insert failed");
      }
    },
    async purgeOld() {
      try {
        await db.from("nightly_run_log").delete().lt("created_at", retentionCutoff());
      } catch {
        console.error("nightly_run_log purge failed");
      }
    },
  };
}
