import { useMemo, useState, useRef, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Link2, CheckCircle2, Users } from "lucide-react";
import { Card } from "@/components/ui/chai";
import { useSignedIn } from "@/lib/use-auth-state";
import { useIngested } from "@/lib/ingested-data-store";
import { useCustomerAliases, unlinkSourceId, linkCustomer } from "@/lib/customer-aliases";
import {
  customerOptions,
  describeCounts,
  findUnmatched,
  countAliasUsage,
  aliasKey,
  autoLinkable,
  sourceLabel,
  groupForSourceId,
  type CustomerOption,
  type UnmatchedGroup,
  type CustomerAlias,
} from "@/lib/customer-matching";
import { CustomerLinkWizard } from "@/components/customer-link-wizard";
import { DuplicateCustomersCard } from "@/components/duplicate-customers-card";

// Illustrative data for the public demo (no DB writes there).
const demoCustomers: CustomerOption[] = [
  { customer_id: "CUS-1001", name: "Acme Corporation", email: "ops@acme.com" },
  { customer_id: "CUS-1042", name: "Northwind Labs", email: "hello@northwind.co" },
  { customer_id: "CUS-1180", name: "Brightpath Health", email: "billing@brightpath.io" },
];
const demoUnmatched: UnmatchedGroup[] = [
  {
    sourceId: "acme-corp-1",
    source: "xero",
    counts: { transactions: 12 },
    total: 12,
    trivial: false,
    suggestions: [
      { customer_id: "CUS-1001", name: "Acme Corporation", reason: "Similar name or ID", confidence: 0.8 },
    ],
  },
  {
    sourceId: "CUS-1042 ",
    source: "zendesk",
    counts: { usage: 4 },
    total: 4,
    trivial: true,
    suggestions: [
      { customer_id: "CUS-1042", name: "Northwind Labs", reason: "Same ID after trimming spaces / casing", confidence: 1 },
    ],
  },
  {
    sourceId: "0053k00000XqPl",
    source: "salesforce",
    counts: { transactions: 7 },
    total: 7,
    trivial: false,
    suggestions: [],
  },
];

const demoAliases: CustomerAlias[] = [
  { source: "xero", source_id: "ACME-CORP-01", customer_id: "CUS-1001", status: "linked" },
  { source: "zendesk", source_id: "northwind labs", customer_id: "CUS-1042", status: "linked" },
  { source: "hubspot", source_id: "INTERNAL-TEST", customer_id: null, status: "ignored" },
];
const demoAliasUsage: Record<string, Record<string, number>> = {
  "xero::ACME-CORP-01": { transactions: 34, usage: 9 },
  "zendesk::northwind labs": { support: 11 },
  "hubspot::INTERNAL-TEST": { transactions: 3 },
};

export function IdentityResolution() {
  const signedIn = useSignedIn();
  const isReal = signedIn === true;
  const ingested = useIngested();
  const liveAliases = useCustomerAliases();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardGroups, setWizardGroups] = useState<UnmatchedGroup[] | null>(null);

  const aliases = isReal ? liveAliases : demoAliases;

  const customers = useMemo(
    () => (isReal ? customerOptions(ingested) : demoCustomers),
    [isReal, ingested],
  );
  const unmatched = useMemo(
    () => (isReal ? findUnmatched(ingested, liveAliases) : demoUnmatched),
    [isReal, ingested, liveAliases],
  );
  const unmatchedRows = unmatched.reduce((s, g) => s + g.total, 0);

  const aliasUsage = useMemo(
    () => (isReal ? countAliasUsage(ingested, liveAliases) : demoAliasUsage),
    [isReal, ingested, liveAliases],
  );

  const customerName = (id: string | null) =>
    customers.find((c) => c.customer_id === id)?.name ?? null;

  // Customers that have more than one platform identity rolling up to them.
  const identityGroups = useMemo(() => {
    const map = new Map<string, CustomerAlias[]>();
    for (const a of aliases) {
      if (a.status !== "linked" || !a.customer_id) continue;
      const list = map.get(a.customer_id) ?? [];
      list.push(a);
      map.set(a.customer_id, list);
    }
    return [...map.entries()]
      .map(([customer_id, list]) => ({ customer_id, list }))
      .sort((a, b) => b.list.length - a.list.length);
  }, [aliases]);

  async function handleUnlink(a: CustomerAlias) {
    if (!isReal) {
      toast.info("Demo mode", { description: "Saved links can be managed once you're signed in." });
      return;
    }
    try {
      await unlinkSourceId(a.source, a.source_id);
      toast.success("Link removed", {
        description: `${a.source_id} will show up as unmatched again.`,
      });
    } catch (e) {
      toast.error("Couldn't remove the link", { description: (e as Error).message });
    }
  }

  function handleChange(a: CustomerAlias) {
    const group = groupForSourceId(
      ingested,
      a.source_id,
      aliasUsage[aliasKey(a.source, a.source_id)] ?? {},
      a.source,
    );
    setWizardGroups([group]);
    setWizardOpen(true);
  }

  function openUnmatchedWizard() {
    setWizardGroups(null);
    setWizardOpen(true);
  }

  // Identities that resolve on an exact email (or an exact id after trimming)
  // are linked automatically — the user only ever confirms ambiguous ones.
  const autoLinked = useRef(new Set<string>());
  useEffect(() => {
    if (!isReal) return;
    const candidates = autoLinkable(unmatched).filter(
      (g) => !autoLinked.current.has(aliasKey(g.source, g.sourceId)),
    );
    if (!candidates.length) return;
    for (const g of candidates) autoLinked.current.add(aliasKey(g.source, g.sourceId));
    void (async () => {
      let linked = 0;
      for (const g of candidates) {
        const s = g.suggestions[0];
        if (!s) continue;
        try {
          await linkCustomer(g.source, g.sourceId, s.customer_id);
          linked++;
        } catch {
          autoLinked.current.delete(aliasKey(g.source, g.sourceId));
        }
      }
      if (linked > 0) {
        toast.success(`Matched ${linked} reference${linked === 1 ? "" : "s"} automatically`, {
          description: "Same email address or ID across platforms — saved so it won't be asked again.",
        });
      }
    })();
  }, [isReal, unmatched]);

  return (
    <div>
      {/* Unmatched records */}
      {(customers.length > 0 || unmatched.length > 0) && (
        <Card>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
                <Link2 className="h-4 w-4" />
              </span>
              <div>
                <h3 className="font-semibold">
                  Unmatched records{unmatched.length > 0 ? ` (${unmatched.length})` : ""}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Rows whose customer reference doesn't match anyone in your customer list. They
                  don't count towards any health score until you link them.
                </p>
              </div>
            </div>
            {unmatched.length > 0 && (
              <button
                onClick={openUnmatchedWizard}
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Link2 className="h-4 w-4" /> Resolve matches
              </button>
            )}
          </div>

          {unmatched.length === 0 ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-success" /> All records are matched to a customer.
            </p>
          ) : (
            <>
              <ul className="mt-4 space-y-2">
                {unmatched.slice(0, 5).map((g) => (
                  <li
                    key={aliasKey(g.source, g.sourceId)}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium">{g.sourceId || "(blank)"}</span>
                      <span className="rounded-md border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {sourceLabel(g.source)}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">{describeCounts(g.counts)}</span>
                    <span className="text-xs text-muted-foreground">
                      {g.suggestions[0]
                        ? `Suggested: ${g.suggestions[0].name}`
                        : "No suggestion — search manually"}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                {unmatchedRows.toLocaleString()} row{unmatchedRows === 1 ? "" : "s"} currently
                excluded from scoring
                {unmatched.length > 5 ? ` · showing 5 of ${unmatched.length} references` : ""}.
              </p>
            </>
          )}
        </Card>
      )}

      {/* Possible duplicate customers */}
      <DuplicateCustomersCard isReal={isReal} />

      {/* Saved links */}
      <Card className="mt-6">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
            <Link2 className="h-4 w-4" />
          </span>
          <div>
            <h3 className="font-semibold">
              Saved links{aliases.length > 0 ? ` (${aliases.length})` : ""}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Links you confirm are remembered permanently and applied automatically to every
              future upload and integration refresh — you'll never match the same ID twice.
            </p>
          </div>
        </div>

        {aliases.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No saved links yet. Matches you confirm are remembered and applied automatically to
            future uploads and syncs.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {aliases.map((a) => {
              const counts = aliasUsage[aliasKey(a.source, a.source_id)] ?? {};
              const rows = Object.values(counts).reduce((s, n) => s + n, 0);
              const name = customerName(a.customer_id);
              return (
                <li
                  key={aliasKey(a.source, a.source_id)}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-medium">
                        {a.source_id || "(blank)"}
                      </span>
                      <span className="rounded-md border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {sourceLabel(a.source)}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      {a.status === "ignored" ? (
                        <span className="rounded-md border border-border bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                          Ignored — not a customer
                        </span>
                      ) : name ? (
                        <span className="text-xs font-medium">{name}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          <span className="font-mono">{a.customer_id}</span> · customer not found
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {rows > 0
                        ? `Currently resolving ${describeCounts(counts)}`
                        : "No rows in your current data use this reference"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => handleChange(a)}
                      className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-secondary"
                    >
                      Change
                    </button>
                    <button
                      onClick={() => void handleUnlink(a)}
                      className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary"
                    >
                      Unlink
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Customer identities */}
      <Card className="mt-6">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
            <Users className="h-4 w-4" />
          </span>
          <div>
            <h3 className="font-semibold">
              Customer identities{identityGroups.length > 0 ? ` (${identityGroups.length})` : ""}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Every customer that has more than one platform ID rolling up to a single profile.
            </p>
          </div>
        </div>

        {identityGroups.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No customers with multiple platform identities yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {identityGroups.map((g) => (
              <li
                key={g.customer_id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {customerName(g.customer_id) ?? g.customer_id}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {g.list.map((a) => (
                      <span
                        key={aliasKey(a.source, a.source_id)}
                        className="rounded-md border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                      >
                        {sourceLabel(a.source)} · {a.source_id || "(blank)"}
                      </span>
                    ))}
                  </div>
                </div>
                {isReal && (
                  <Link
                    to="/app/customers/$id"
                    params={{ id: g.customer_id }}
                    className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-secondary"
                  >
                    View profile
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <CustomerLinkWizard
        open={wizardOpen}
        onOpenChange={(v) => {
          setWizardOpen(v);
          if (!v) setWizardGroups(null);
        }}
        groups={wizardGroups ?? unmatched}
        customers={customers}
        readOnly={!isReal}
      />
    </div>
  );
}
