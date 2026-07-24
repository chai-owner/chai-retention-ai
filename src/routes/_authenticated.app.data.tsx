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

      <UploadDatasetsCard />
    </div>
  );
}
