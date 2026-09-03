import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/ui/chai";
import { TablePagination } from "@/components/ui/table-pagination";
import { formatCurrency } from "@/lib/mock-data";
import { listTransactionsPage, TRANSACTION_PAGE_SIZE } from "@/lib/data-tables.functions";
import { useEffectiveSignedIn } from "@/lib/use-auth-state";

export const Route = createFileRoute("/_authenticated/app/transactions")({
  head: () => ({
    meta: [
      { title: "Transactions — ChAi" },
      {
        name: "description",
        content: "Browse every imported transaction, including invoice due dates, balances and overdue days.",
      },
      { property: "og:title", content: "Transactions — ChAi" },
      {
        property: "og:description",
        content: "Browse every imported transaction, including invoice due dates, balances and overdue days.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { page?: number } => {
    const n = Number(search["page"]);
    return Number.isFinite(n) && n > 1 ? { page: Math.floor(n) } : {};
  },
  component: TransactionsPage,
});

function fmtDate(v: string | null) {
  return v ? v : "—";
}

function TransactionsPage() {
  const { page = 1 } = Route.useSearch();
  const navigate = useNavigate();
  const signedIn = useEffectiveSignedIn();
  const fetchPage = useServerFn(listTransactionsPage);

  const q = useQuery({
    queryKey: ["transactions-page", page],
    enabled: signedIn === true,
    queryFn: () => fetchPage({ data: { page, pageSize: TRANSACTION_PAGE_SIZE } }),
  });

  const rows = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;

  useEffect(() => {
    if (page > 1 && total > 0 && (page - 1) * TRANSACTION_PAGE_SIZE >= total) {
      navigate({ to: "/app/transactions", search: {}, replace: true });
    }
  }, [page, total, navigate]);

  return (
    <div>
      <PageHeader
        title="Transactions"
        description="Every transaction and invoice ChAi has imported from your uploads and accounting integrations."
      />

      <div className="overflow-hidden rounded-[14px] border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Transaction</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Date</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Due</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">Outstanding</th>
                <th className="px-4 py-3 font-medium">Overdue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 font-medium">{r.transactionId}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.customerId || "—"}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {r.amount == null ? "—" : formatCurrency(r.amount)}
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                    {fmtDate(r.occurredAt)}
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                    {fmtDate(r.dueDate)}
                  </td>
                  <td className="hidden px-4 py-3 tabular-nums lg:table-cell">
                    {r.amountDue == null ? "—" : formatCurrency(r.amountDue)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {r.daysOverdue && r.daysOverdue > 0 ? (
                      <span className="font-medium text-danger">{r.daysOverdue}d</span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {q.isLoading ? "Loading transactions…" : "No transactions imported yet."}
          </p>
        )}
        <TablePagination
          page={page}
          pageSize={TRANSACTION_PAGE_SIZE}
          total={total}
          noun="transactions"
          onPageChange={(next) =>
            navigate({ to: "/app/transactions", search: next > 1 ? { page: next } : {} })
          }
        />
      </div>
    </div>
  );
}
