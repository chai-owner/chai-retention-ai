// Nightly run log — pure helpers. The log stores counts, timings, step names
// and a fixed error TYPE only. Raw error messages are never stored, because a
// provider error can echo a customer name, ticket subject or note text.

export const ERROR_TYPES = [
  "timeout",
  "auth",
  "permission",
  "rate_limit",
  "not_found",
  "network",
  "budget",
  "validation",
  "database",
  "provider_error",
  "unknown",
] as const;
export type ErrorType = (typeof ERROR_TYPES)[number];

const RULES: Array<[ErrorType, RegExp]> = [
  ["timeout", /time(d)?\s?out|deadline|aborted/i],
  ["rate_limit", /\b429\b|rate.?limit|too many requests|quota/i],
  ["auth", /\b401\b|unauthori[sz]ed|invalid[_ ]grant|token (expired|revoked|invalid)|re-?connect|refresh token/i],
  ["permission", /\b403\b|forbidden|permission|scope/i],
  ["not_found", /\b404\b|not found/i],
  ["network", /fetch failed|ECONN|ENOTFOUND|socket|network|dns/i],
  ["budget", /budget|ceiling|paused/i],
  ["validation", /invalid|parse|schema|zod|unexpected token|json/i],
  ["database", /duplicate key|violates|relation .* does not exist|column .* does not exist|postgres|PGRST/i],
  ["provider_error", /\b5\d\d\b|internal server error|bad gateway|service unavailable/i],
];

/** Map any error to a fixed category. The message itself is discarded. */
export function classifyError(err: unknown): ErrorType {
  const msg =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!msg) return "unknown";
  for (const [type, re] of RULES) if (re.test(msg)) return type;
  return "unknown";
}

export interface RunLogEntry {
  user_id: string | null;
  source: string;
  provider: string;
  step: string;
  ok: boolean;
  rows_read?: number | null;
  rows_saved?: number | null;
  signals?: number | null;
  duration_ms?: number | null;
  error_type?: ErrorType | null;
  started_at?: string;
  finished_at?: string;
}

const SAFE_TOKEN = /^[a-z0-9_.,:-]{1,64}$/i;

/**
 * Last line of defence: only whitelisted fields survive, text fields must be
 * short identifier-like tokens, and numbers must be finite non-negative ints.
 */
export function sanitizeEntry(e: RunLogEntry): RunLogEntry {
  const tok = (s: string) => (SAFE_TOKEN.test(s) ? s : "invalid");
  const num = (n: number | null | undefined) =>
    typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  return {
    user_id: e.user_id && /^[0-9a-f-]{36}$/i.test(e.user_id) ? e.user_id : null,
    source: tok(e.source),
    provider: tok(e.provider),
    step: tok(e.step),
    ok: Boolean(e.ok),
    rows_read: num(e.rows_read),
    rows_saved: num(e.rows_saved),
    signals: num(e.signals),
    duration_ms: num(e.duration_ms),
    error_type: e.error_type && (ERROR_TYPES as readonly string[]).includes(e.error_type)
      ? e.error_type
      : e.ok
        ? null
        : "unknown",
    started_at: e.started_at,
    finished_at: e.finished_at,
  };
}

export const RUN_LOG_RETENTION_DAYS = 90;

export function retentionCutoff(now: Date = new Date()): string {
  return new Date(now.getTime() - RUN_LOG_RETENTION_DAYS * 86_400_000).toISOString();
}
