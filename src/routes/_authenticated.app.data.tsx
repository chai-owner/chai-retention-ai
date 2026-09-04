import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui/chai";
import { SmartIngestCard, UploadDatasetsCard } from "@/components/data-uploads-panel";
import { IntegrationsPanel } from "@/components/integrations-panel";

export const Route = createFileRoute("/_authenticated/app/data")({
  head: () => ({ meta: [{ title: "Data Uploads & Integrations — ChAi" }] }),
  component: DataPage,
});

function DataPage() {
  return (
    <div>
      <PageHeader
        title="Data Uploads & Integrations"
        description="Bring your customer, transaction and support data into ChAi. We'll check how ready it is and map it for you."
      />
      <IntegrationsPanel />

      {/* Clear divider — the standard, do-it-yourself uploads & integrations are
          above; the ChAi Data Drop below is the AI add-on. */}
      <div className="my-10 flex items-center gap-4">
        <span className="h-px flex-1 bg-border" />
        <span className="rounded-full border border-border bg-secondary px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Or use ChAi's AI data drop
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <SmartIngestCard />

      {/* Divider for manual upload option */}
      <div className="my-10 flex items-center gap-4">
        <span className="h-px flex-1 bg-border" />
        <span className="rounded-full border border-border bg-secondary px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Or upload your data manually
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <UploadDatasetsCard />

      <PausedCustomersCard />
    </div>
  );
}

/**
 * Customers held back by the plan's customer limit. Their records are kept in
 * full — they simply don't count towards scoring until the plan is upgraded.
 */
function PausedCustomersCard() {
  const fetchPaused = useServerFn(listPausedCustomers);
  const { data } = useQuery({
    queryKey: ["paused-customers"],
    queryFn: () => fetchPaused(),
    staleTime: 60_000,
    retry: false,
  });

  if (!data || data.total === 0) return null;

  return (
    <section className="mt-10 rounded-2xl border border-warning/40 bg-warning/5 p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <PauseCircle className="h-4 w-4 text-warning" /> Paused customers ({data.total})
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        These customers are over your plan's limit, so they're paused. Nothing has
        been deleted — upgrade your plan and they'll be scored again automatically.
      </p>
      <ul className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
        {data.rows.map((row) => (
          <li key={row.customerId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <span className="text-foreground">{row.name}</span>
            <span className="text-xs text-muted-foreground">{row.email || row.customerId}</span>
          </li>
        ))}
      </ul>
      {data.total > data.rows.length && (
        <p className="mt-3 text-xs text-muted-foreground">
          Showing the first {data.rows.length} of {data.total} paused customers.
        </p>
      )}
    </section>
  );
}
