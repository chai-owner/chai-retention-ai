import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/ui/chai";
import { TablePagination } from "@/components/ui/table-pagination";
import { listSupportPage, SUPPORT_PAGE_SIZE } from "@/lib/data-tables.functions";
import { useEffectiveSignedIn } from "@/lib/use-auth-state";

export const Route = createFileRoute("/_authenticated/app/support")({
  head: () => ({
    meta: [
      { title: "Support Tickets — ChAi" },
      {
        name: "description",
        content: "Every support ticket ChAi has imported from your help desk integrations and uploads.",
      },
      { property: "og:title", content: "Support Tickets — ChAi" },
      {
        property: "og:description",
        content: "Every support ticket ChAi has imported from your help desk integrations and uploads.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { page?: number } => {
    const n = Number(search["page"]);
    return Number.isFinite(n) && n > 1 ? { page: Math.floor(n) } : {};
  },
  component: SupportPage,
});

function SupportPage() {
  const { page = 1 } = Route.useSearch();
  const navigate = useNavigate();
  const signedIn = useEffectiveSignedIn();
  const fetchPage = useServerFn(listSupportPage);

  const q = useQuery({
    queryKey: ["support-page", page],
    enabled: signedIn === true,
    queryFn: () => fetchPage({ data: { page, pageSize: SUPPORT_PAGE_SIZE } }),
  });

  const rows = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;

  useEffect(() => {
    if (page > 1 && total > 0 && (page - 1) * SUPPORT_PAGE_SIZE >= total) {
      navigate({ to: "/app/support", search: {}, replace: true });
    }
  }, [page, total, navigate]);

  return (
    <div>
      <PageHeader
        title="Support Tickets"
        description="Every ticket ChAi has imported from your help desk, used to spot frustration before it turns into churn."
      />

      <div className="overflow-hidden rounded-[14px] border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Ticket</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Subject</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">Imported</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 font-medium">{r.ticketId}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.customerId || "—"}</td>
                  <td className="hidden max-w-md truncate px-4 py-3 md:table-cell">
                    {r.subject || "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.status || "—"}</td>
                  <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                    {r.createdAt ? r.createdAt.slice(0, 10) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {q.isLoading ? "Loading tickets…" : "No support tickets imported yet."}
          </p>
        )}
        <TablePagination
          page={page}
          pageSize={SUPPORT_PAGE_SIZE}
          total={total}
          noun="tickets"
          onPageChange={(next) =>
            navigate({ to: "/app/support", search: next > 1 ? { page: next } : {} })
          }
        />
      </div>
    </div>
  );
}
