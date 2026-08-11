// "Possible duplicate customers" queue — roster-level dedup across platforms.
// Confirming a merge writes the same saved-link records used everywhere else,
// so it is applied automatically on every future upload and sync.
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Users, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/chai";
import { useIngested } from "@/lib/ingested-data-store";
import { useCustomerAliases, linkCustomer } from "@/lib/customer-aliases";
import { sourceLabel, aliasKey } from "@/lib/customer-matching";
import { findDuplicateCustomers, type DuplicateGroup } from "@/lib/customer-merge";

const demoGroups: DuplicateGroup[] = [
  {
    master: {
      customer_id: "CUS-1001",
      source: "hubspot",
      name: "Acme Corporation",
      email: "ops@acme.com",
      richness: 8,
      row: {},
    },
    members: [
      { customer_id: "XR-4471", source: "xero", name: "Acme Corp", email: "ops@acme.com", richness: 5, row: {} },
      { customer_id: "zd-8812", source: "zendesk", name: "Acme", email: "support@acme.com", richness: 4, row: {} },
    ],
    reason: "Same contact email (ops@acme.com)",
    confidence: 1,
  },
  {
    master: {
      customer_id: "CUS-1180",
      source: "salesforce",
      name: "Brightpath Health",
      email: "billing@brightpath.io",
      richness: 7,
      row: {},
    },
    members: [
      { customer_id: "QB-233", source: "quickbooks", name: "Brightpath Health Ltd", email: "ap@brightpath.io", richness: 4, row: {} },
    ],
    reason: "Same email domain (brightpath.io) and matching company name",
    confidence: 0.9,
  },
];

export function DuplicateCustomersCard({ isReal }: { isReal: boolean }) {
  const ingested = useIngested();
  const aliases = useCustomerAliases();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const groups = useMemo(
    () => (isReal ? findDuplicateCustomers(ingested, aliases) : demoGroups),
    [isReal, ingested, aliases],
  );
  const visible = groups.filter((g) => !dismissed.has(aliasKey(g.master.source, g.master.customer_id)));

  async function merge(g: DuplicateGroup) {
    const key = aliasKey(g.master.source, g.master.customer_id);
    if (!isReal) {
      toast.info("Demo mode", { description: "Merging is available once you're signed in." });
      return;
    }
    setBusy(key);
    try {
      for (const m of g.members) {
        await linkCustomer(m.source, m.customer_id, g.master.customer_id);
      }
      toast.success(`Merged into ${g.master.name}`, {
        description: `${g.members.length} duplicate record${g.members.length === 1 ? "" : "s"} now roll up to one customer — remembered for future syncs.`,
      });
    } catch (e) {
      toast.error("Couldn't merge those records", { description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  function notDuplicate(g: DuplicateGroup) {
    setDismissed((prev) => new Set(prev).add(aliasKey(g.master.source, g.master.customer_id)));
  }

  return (
    <Card className="mt-6">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
          <Users className="h-4 w-4" />
        </span>
        <div>
          <h3 className="font-semibold">
            Possible duplicate customers{visible.length > 0 ? ` (${visible.length})` : ""}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            The same company can exist in more than one connected platform. Merging keeps one
            master profile per customer, so health scores and revenue aren't split in two.
          </p>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-success" /> No duplicate customers detected.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {visible.slice(0, 6).map((g) => {
            const key = aliasKey(g.master.source, g.master.customer_id);
            return (
              <li key={key} className="rounded-lg border border-border/60 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{g.master.name}</span>
                      <span className="rounded-md border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {sourceLabel(g.master.source)} · master
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {Math.round(g.confidence * 100)}% match
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{g.reason}</p>
                    <ul className="mt-2 space-y-1">
                      {g.members.map((m) => (
                        <li
                          key={aliasKey(m.source, m.customer_id)}
                          className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
                        >
                          <span className="text-muted-foreground">↳</span>
                          <span className="font-medium text-foreground">{m.name}</span>
                          <span className="font-mono text-[11px]">{m.customer_id}</span>
                          <span className="rounded-md border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-medium">
                            {sourceLabel(m.source)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => void merge(g)}
                      disabled={busy === key}
                      className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                    >
                      {busy === key ? "Merging…" : "Merge"}
                    </button>
                    <button
                      onClick={() => notDuplicate(g)}
                      className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary"
                    >
                      Not a match
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
