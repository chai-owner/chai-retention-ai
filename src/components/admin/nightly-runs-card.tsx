import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/chai";
import { listNightlyRuns, type NightlyRunEntry } from "@/lib/admin.functions";

const SOURCE_LABEL: Record<string, string> = {
  hubspot: "HubSpot notes & emails",
  zendesk: "Zendesk conversations",
  intercom: "Intercom conversations",
  zoho_crm: "Zoho CRM",
  quickbooks: "QuickBooks",
  xero: "Xero",
  freshbooks: "FreshBooks",
};

function label(e: NightlyRunEntry) {
  if (e.source === "run") return e.step === "start" ? "Run started" : "Run finished";
  const name = SOURCE_LABEL[e.provider] ?? e.provider;
  return e.source === "content" ? `${name} — warning signs` : `${name} — ${e.source} sync`;
}

export function NightlyRunsCard() {
  const fetchRuns = useServerFn(listNightlyRuns);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "nightly-runs"],
    queryFn: () => fetchRuns(),
  });

  const runs = new Map<string, NightlyRunEntry[]>();
  for (const e of data ?? []) {
    const list = runs.get(e.runId) ?? [];
    list.push(e);
    runs.set(e.runId, list);
  }

  return (
    <Card className="mb-6">
      <p className="font-medium">Last nightly runs</p>
      <p className="mt-1 text-sm text-muted-foreground">
        One line per account and source for the past 7 days. Counts and error types only. Kept for 90 days.
      </p>
      {isLoading && <p className="mt-3 text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="mt-3 text-sm text-destructive">{(error as Error).message}</p>}
      {!isLoading && !error && runs.size === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">No nightly runs recorded yet.</p>
      )}
      <div className="mt-4 space-y-5">
        {[...runs.entries()].map(([runId, entries]) => {
          const sorted = [...entries].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
          const finished = sorted.find((e) => e.source === "run" && e.step === "finish");
          return (
            <div key={runId}>
              <p className="text-sm font-medium">
                {new Date(sorted[0].startedAt).toLocaleString()}{" "}
                <span className="text-muted-foreground">
                  {finished ? `· finished in ${Math.round((finished.durationMs ?? 0) / 1000)}s` : "· did not finish"}
                </span>
              </p>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-3 font-medium">Account</th>
                      <th className="py-1 pr-3 font-medium">Step</th>
                      <th className="py-1 pr-3 font-medium text-right">Read</th>
                      <th className="py-1 pr-3 font-medium text-right">Saved</th>
                      <th className="py-1 pr-3 font-medium text-right">Signals</th>
                      <th className="py-1 pr-3 font-medium">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {sorted.filter((e) => e.source !== "run").map((e, i) => (
                      <tr key={i}>
                        <td className="py-1 pr-3">{e.accountLabel ?? "—"}</td>
                        <td className="py-1 pr-3">{label(e)}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{e.rowsRead ?? "—"}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{e.rowsSaved ?? "—"}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{e.signals ?? "—"}</td>
                        <td className={`py-1 pr-3 ${e.ok ? "text-success" : "text-destructive"}`}>
                          {e.ok ? "OK" : `Error: ${e.errorType ?? "unknown"}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
