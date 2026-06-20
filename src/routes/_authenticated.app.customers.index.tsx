import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Search, ArrowUpDown } from "lucide-react";
import { PageHeader, HealthBadge, ScoreBar } from "@/components/ui/chai";
import {
  sortedByRisk,
  categoryFromHealth,
  formatCurrency,
  riskMeta,
  type RiskCategory,
} from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/customers/")({
  head: () => ({ meta: [{ title: "Customer Risk Center — ChAi" }] }),
  component: Customers,
});

const filters: { key: RiskCategory | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "critical", label: "Critical" },
  { key: "at-risk", label: "At risk" },
  { key: "watch", label: "Watch" },
  { key: "healthy", label: "Healthy" },
];

function Customers() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RiskCategory | "all">("all");

  const rows = useMemo(() => {
    return sortedByRisk.filter((c) => {
      const cat = categoryFromHealth(c.health);
      const matchesFilter = filter === "all" || cat === filter;
      const matchesQuery = c.name.toLowerCase().includes(query.toLowerCase());
      return matchesFilter && matchesQuery;
    });
  }, [query, filter]);

  return (
    <div>
      <PageHeader
        title="Customer Risk Center"
        description="Every customer ranked by churn risk. The riskiest, highest-value accounts rise to the top so you know exactly who to focus on."
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customers…"
            className="w-full rounded-lg border border-input bg-card py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                filter === f.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-accent",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Health</th>
                <th className="px-4 py-3 font-medium">
                  <span className="inline-flex items-center gap-1">
                    Risk <ArrowUpDown className="h-3 w-3" />
                  </span>
                </th>
                <th className="px-4 py-3 font-medium">Revenue</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Churn prob.</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const cat = categoryFromHealth(c.health);
                return (
                  <tr
                    key={c.id}
                    onClick={() => navigate({ to: "/app/customers/$id", params: { id: c.id } })}
                    className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-accent/40"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to="/app/customers/$id"
                        params={{ id: c.id }}
                        onClick={(e) => e.stopPropagation()}
                        className="block"
                      >
                        <p className="font-medium text-foreground hover:text-primary">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.segment}</p>
                      </Link>
                    </td>
                    <td className="w-40 px-4 py-3">
                      <ScoreBar value={c.health} />
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("font-semibold tabular-nums", riskMeta[cat].text)}>{c.risk}</span>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{formatCurrency(c.revenue)}</td>
                    <td className="hidden px-4 py-3 tabular-nums md:table-cell">{c.churnProbability}%</td>
                    <td className="px-4 py-3">
                      <HealthBadge category={cat} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">No customers match your filters.</p>
        )}
      </div>
    </div>
  );
}
