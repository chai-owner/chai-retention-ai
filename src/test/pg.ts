// Boots a throwaway PostgreSQL instance for integration tests that need real
// concurrent writers (the accounting refresh lock). Queries go through `psql`,
// so every statement runs on its own backend connection — genuine concurrency,
// no extra npm dependency.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 55432;
const HOST = "127.0.0.1";

export interface PgHandle {
  query: (sql: string) => unknown[];
  /** Runs statements verbatim (DDL, function definitions) with no wrapping. */
  exec: (sql: string) => void;
  stop: () => void;
}

function have(bin: string): boolean {
  return spawnSync("bash", ["-lc", `command -v ${bin}`]).status === 0;
}

/** Returns null when this environment cannot run a local Postgres. */
export function startPostgres(): PgHandle | null {
  if (!have("initdb") || !have("pg_ctl") || !have("psql")) return null;

  const root = join(tmpdir(), `chai-pgtest-${process.pid}`);
  const data = join(root, "data");
  const env = { ...process.env, PGSSLMODE: "disable", PGDATA: data, HOME: root };

  const asUser = (cmd: string) =>
    process.getuid?.() === 0
      ? ["setpriv", ["--reuid", "1000", "--regid", "1000", "--clear-groups", "bash", "-lc", cmd]]
      : ["bash", ["-lc", cmd]];

  try {
    rmSync(root, { recursive: true, force: true });
    mkdirSync(data, { recursive: true });
    if (process.getuid?.() === 0) execFileSync("chown", ["-R", "1000:1000", root]);
    const [bin, args] = asUser(
      `initdb -U postgres -A trust -D ${data} >${root}/initdb.log 2>&1 && ` +
        `pg_ctl -D ${data} -o "-p ${PORT} -k ${root} -c listen_addresses=${HOST}" -l ${root}/pg.log start`,
    ) as [string, string[]];
    execFileSync(bin, args, { env, stdio: "ignore" });
  } catch {
    return null;
  }

  const query = (sql: string): unknown[] => {
    const wrapped = /^\s*select/i.test(sql)
      ? `select coalesce(json_agg(t), '[]'::json)::text from (${sql}) t`
      : `with t as (${sql}) select coalesce(json_agg(t), '[]'::json)::text from t`;

    const out = execFileSync(
      "psql",
      ["-U", "postgres", "-h", HOST, "-p", String(PORT), "-v", "ON_ERROR_STOP=1", "-tAc", wrapped],
      { env, encoding: "utf8" },
    ).trim();
    return JSON.parse(out || "[]") as unknown[];
  };

  const exec = (sql: string) => {
    execFileSync(
      "psql",
      ["-U", "postgres", "-h", HOST, "-p", String(PORT), "-v", "ON_ERROR_STOP=1", "-c", sql],
      { env, encoding: "utf8" },
    );
  };

  // Wait for readiness.
  let ready = false;
  for (let i = 0; i < 40 && !ready; i++) {
    try {
      exec("select 1");
      ready = true;
    } catch {
      spawnSync("sleep", ["0.25"]);
    }
  }
  if (!ready) return null;

  return {
    query: (sql: string) => (/^\s*select/i.test(sql) || /returning/i.test(sql) ? query(sql) : (exec(sql), [])),
    exec,
    stop: () => {
      try {
        const [bin, args] = asUser(`pg_ctl -D ${data} -m immediate stop`) as [string, string[]];
        execFileSync(bin, args, { env, stdio: "ignore" });
      } catch {
        /* best effort */
      }
      if (existsSync(root)) rmSync(root, { recursive: true, force: true });
    },
  };
}

/** SQL literal for the small set of value types the shim persists. */
export function lit(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

/**
 * Minimal supabase-postgrest shim over the real database: only the query
 * shapes the accounting refresh path uses (select/eq/or/update/select/
 * maybeSingle). Each call executes a real SQL statement.
 */
export function pgSupabase(pg: PgHandle) {
  return {
    from(table: string) {
      const state = {
        table,
        op: "select" as "select" | "update",
        payload: {} as Record<string, unknown>,
        wheres: [] as string[],
        returning: "*",
      };
      const builder: Record<string, unknown> = {};
      const run = () => {
        const where = state.wheres.length ? ` where ${state.wheres.join(" and ")}` : "";
        if (state.op === "update") {
          const sets = Object.entries(state.payload)
            .map(([k, v]) => `${k} = ${lit(v)}`)
            .join(", ");
          const rows = pg.query(
            `update ${state.table} set ${sets}${where} returning ${state.returning}`,
          );
          return { data: rows, error: null };
        }
        const rows = pg.query(`select ${state.returning} from ${state.table}${where}`);
        return { data: rows, error: null };
      };
      Object.assign(builder, {
        select: (cols?: string) => {
          if (cols) state.returning = cols;
          return builder;
        },
        update: (payload: Record<string, unknown>) => {
          state.op = "update";
          state.payload = payload;
          return builder;
        },
        eq: (col: string, val: unknown) => {
          state.wheres.push(`${col} = ${lit(val)}`);
          return builder;
        },
        or: (expr: string) => {
          // Only the stale-lock predicate is used by the accounting code.
          const parts = expr.split(",").map((p) => {
            const [col, op, val] = p.split(".");
            if (op === "is") return `${col} is ${val}`;
            if (op === "lt") return `${col} < ${lit(p.slice(`${col}.lt.`.length))}`;
            throw new Error(`unsupported or() clause: ${p}`);
          });
          state.wheres.push(`(${parts.join(" or ")})`);
          return builder;
        },
        maybeSingle: async () => {
          const r = run();
          return { data: (r.data as unknown[])[0] ?? null, error: null };
        },
        then: (onFulfilled: (r: unknown) => unknown) => Promise.resolve(run()).then(onFulfilled),
      });
      return builder;
    },
  };
}
