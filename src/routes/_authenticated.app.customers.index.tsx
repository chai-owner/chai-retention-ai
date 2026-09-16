import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, ArrowUpDown } from "lucide-react";
import { PageHeader, HealthBadge, ScoreBar } from "@/components/ui/chai";
import { DataCoverageBanner } from "@/components/data-coverage-banner";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  categoryFromHealth,
  formatCurrency,
  riskMeta,
  getChurnedCustomers,
  getWonBackCustomers,
  type RiskCategory,
  type Customer,
} from "@/lib/mock-data";
import { useScoredData } from "@/lib/use-scored-data";
import { useChurnOverrides } from "@/lib/churn-store";
import { useEffectiveSignedIn } from "@/lib/use-auth-state";
import { churnProbabilityFromHealth } from "@/lib/churn-probability";
import { listCustomerRiskPage, CUSTOMER_PAGE_SIZE } from "@/lib/data-tables.functions";
import { pageSlice } from "@/lib/pagination";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/customers/")({
  head: () => ({ meta: [{ title: "Customer Risk Center — ChAi" }] }),
  validateSearch: (search: Record<string, unknown>): { page?: number } => {
    const n = Number(search["page"]);
    return Number.isFinite(n) && n > 1 ? { page: Math.floor(n) } : {};
  },
  component: Customers,
});

type Lifecycle = "active" | "churned" | "won-back";

const lifecycleTabs: { key: Lifecycle; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "churned", label: "Churned" },
  { key: "won-back", label: "Won back" },
];

const filters: { key: RiskCategory | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "critical", label: "Critical" },
  { key: "at-risk", label: "At risk" },
  { key: "watch", label: "Watch" },
  { key: "healthy", label: "Healthy" },
];

// Row shape rendered by the table, from either the server page or live scoring.
interface RiskRow {
  id: string;
  name: string;
  segment: string;
  health: number;
  risk: number;
  revenue: number;
  churnProbability: number;
}

function fromCustomer(c: Customer): RiskRow {
  return {
    id: c.id,
    name: c.name,
    segment: c.segment,
    health: c.health,
    risk: c.risk,
    revenue: c.revenue,
    churnProbability: c.churnProbability,
  };
}

function Customers() {
  const navigate = useNavigate();
  const { page = 1 } = Route.useSearch();
  const { sortedByRisk } = useScoredData();
  const overrides = useChurnOverrides();
  const signedIn = useEffectiveSignedIn();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RiskCategory | "all">("all");
  const [lifecycle, setLifecycle] = useState<Lifecycle>("active");

  function setPage(next: number) {
    navigate({
      to: "/app/customers",
      search: next > 1 ? { page: next } : {},
      replace: false,
    });
  }

  // Changing a filter, tab or search resets to the first page.
  function resetToFirstPage() {
    if (page !== 1) navigate({ to: "/app/customers", search: {}, replace: true });
  }

  // Active list excludes anything manually flagged as churned/won-back.
  const activeRows = useMemo(
    () => sortedByRisk.filter((c) => !overrides[c.id]),
    [sortedByRisk, overrides],
  );

  // Manual overrides pull accounts into the churned / won-back tabs.
  const overriddenChurned = useMemo(
    () => sortedByRisk.filter((c) => overrides[c.id]?.status === "churned"),
    [sortedByRisk, overrides],
  );
  const overriddenWonBack = useMemo(
    () => sortedByRisk.filter((c) => overrides[c.id]?.status === "won-back"),
    [sortedByRisk, overrides],
  );

  const dataset: Customer[] = useMemo(() => {
    if (lifecycle === "churned") return [...getChurnedCustomers(), ...overriddenChurned];
    if (lifecycle === "won-back") return [...getWonBackCustomers(), ...overriddenWonBack];
    return activeRows;
  }, [lifecycle, activeRows, overriddenChurned, overriddenWonBack]);

  const filtered = useMemo(() => {
    return dataset.filter((c) => {
      const cat = categoryFromHealth(c.health);
      const matchesFilter = lifecycle !== "active" || filter === "all" || cat === filter;
      const matchesQuery = c.name.toLowerCase().includes(query.toLowerCase());
      return matchesFilter && matchesQuery;
    });
  }, [query, filter, lifecycle, dataset]);

  // Server-side paging applies to the plain "active, no search" view, which is
  // what the nightly scoring snapshot can answer directly from the database.
  const serverEligible = signedIn === true && lifecycle === "active" && query.trim() === "";
  const fetchPage = useServerFn(listCustomerRiskPage);
  const serverPage = useQuery({
    queryKey: ["customer-risk-page", page, filter],
    enabled: serverEligible,
    queryFn: () =>
      fetchPage({
        data: { page, pageSize: CUSTOMER_PAGE_SIZE, risk: filter === "all" ? undefined : filter },
      }),
  });

  const useServerRows = serverEligible && serverPage.data?.hasSnapshot === true;

  const rows: RiskRow[] = useMemo(() => {
    if (useServerRows) {
      return (serverPage.data?.rows ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        segment: r.segment,
        health: r.health,
        risk: Math.max(0, 100 - r.health),
        revenue: r.revenue,
        churnProbability: churnProbabilityFromHealth(r.health),
      }));
    }
    return pageSlice(filtered.map(fromCustomer), page, CUSTOMER_PAGE_SIZE);
  }, [useServerRows, serverPage.data, filtered, page]);

  const total = useServerRows ? (serverPage.data?.total ?? 0) : filtered.length;

  // A stale ?page= (e.g. after deleting data) shouldn't strand the user on an
  // empty page.
  useEffect(() => {
    if (page > 1 && total > 0 && (page - 1) * CUSTOMER_PAGE_SIZE >= total) {
      navigate({ to: "/app/customers", search: {}, replace: true });
    }
  }, [page, total, navigate]);

  return (
    <div>
      <PageHeader
        title="Customer Risk Center"
        description="Every customer ranked by churn risk. The riskiest, highest-value accounts rise to the top so you know exactly who to focus on."
      />

      <div className="mb-4">
        <DataCoverageBanner />
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {lifecycleTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setLifecycle(t.key);
              resetToFirstPage();
            }}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
              lifecycle === t.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-accent",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              resetToFirstPage();
            }}
            placeholder="Search customers…"
            className="w-full rounded-lg border border-input bg-card py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        {lifecycle === "active" && (
          <div className="flex flex-wrap gap-1.5">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => {
                  setFilter(f.key);
                  resetToFirstPage();
                }}
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
        )}
      </div>


      <div className="overflow-hidden rounded-[14px] border border-border bg-card">
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
                <th className="hidden px-4 py-3 font-medium md:table-cell">Churn probability</th>
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
                    <td className="hidden px-4 py-3 md:table-cell">
                      <span className="font-medium tabular-nums">{c.churnProbability}%</span>
                      <span className="block text-xs text-muted-foreground">in the next 90 days</span>
                    </td>
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
        <TablePagination
          page={page}
          pageSize={CUSTOMER_PAGE_SIZE}
          total={total}
          noun="customers"
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
