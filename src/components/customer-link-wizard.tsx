// Wizard for resolving rows whose customer_id doesn't match any customer.
// The user searches for a customer by name/ID and links the orphaned rows,
// or marks the id as "not a customer" so it stops being flagged.
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Link2, Search, Sparkles, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CustomerOption, UnmatchedGroup } from "@/lib/customer-matching";
import { describeCounts } from "@/lib/customer-matching";
import { ignoreSourceId, linkCustomer } from "@/lib/customer-aliases";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  groups: UnmatchedGroup[];
  customers: CustomerOption[];
  /** Demo mode: don't hit the database. */
  readOnly?: boolean;
}

export function CustomerLinkWizard({ open, onOpenChange, groups, customers, readOnly }: Props) {
  const [index, setIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const group = groups[Math.min(index, Math.max(groups.length - 1, 0))];

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? customers.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.customer_id.toLowerCase().includes(q) ||
            (c.email ?? "").toLowerCase().includes(q),
        )
      : customers;
    return list.slice(0, 8);
  }, [customers, query]);

  function next() {
    setQuery("");
    if (index >= groups.length - 1) {
      onOpenChange(false);
      setIndex(0);
    }
    // When a group is resolved it disappears from `groups`, so the same index
    // naturally advances to the next one.
  }

  async function handleLink(customerId: string, name: string) {
    if (!group) return;
    if (readOnly) {
      toast.info("Demo mode", { description: "Linking is available once you're signed in." });
      return;
    }
    setBusy(true);
    try {
      await linkCustomer(group.sourceId, customerId);
      toast.success("Records linked", {
        description: `${group.total} row${group.total === 1 ? "" : "s"} now count towards ${name}.`,
      });
      next();
    } catch (e) {
      toast.error("Couldn't save the link", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function handleIgnore() {
    if (!group) return;
    if (readOnly) {
      toast.info("Demo mode", { description: "Linking is available once you're signed in." });
      return;
    }
    setBusy(true);
    try {
      await ignoreSourceId(group.sourceId);
      toast.success("Marked as not a customer");
      next();
    } catch (e) {
      toast.error("Couldn't save", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Link unmatched records</DialogTitle>
          <DialogDescription>
            {groups.length > 0
              ? `${groups.length} unmatched reference${groups.length === 1 ? "" : "s"} left. Pick the customer each one belongs to.`
              : "Everything is matched."}
          </DialogDescription>
        </DialogHeader>

        {!group ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            All records are linked to a customer.
          </p>
        ) : (
          <div>
            <div className="rounded-xl border border-border bg-secondary/40 p-3">
              <p className="font-mono text-sm font-medium">{group.sourceId || "(blank)"}</p>
              <p className="mt-1 text-xs text-muted-foreground">{describeCounts(group.counts)}</p>
            </div>

            {group.suggestions.length > 0 && (
              <div className="mt-4">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" /> Suggested matches
                </p>
                <div className="mt-2 space-y-2">
                  {group.suggestions.map((s) => (
                    <button
                      key={s.customer_id}
                      disabled={busy}
                      onClick={() => handleLink(s.customer_id, s.name)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                        s.confidence === 1
                          ? "border-primary/40 bg-primary/5 hover:bg-primary/10"
                          : "border-border hover:bg-secondary/60",
                      )}
                    >
                      <span>
                        <span className="font-medium">{s.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {s.customer_id} · {s.reason}
                        </span>
                      </span>
                      <Link2 className="h-4 w-4 shrink-0 text-primary" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4">
              <p className="text-xs font-medium text-muted-foreground">Search customers</p>
              <div className="relative mt-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Customer name, ID or email"
                  aria-label="Search customers"
                  className="pl-9"
                />
              </div>
              <div className="mt-2 max-h-52 space-y-1 overflow-y-auto">
                {results.map((c) => (
                  <button
                    key={c.customer_id}
                    disabled={busy}
                    onClick={() => handleLink(c.customer_id, c.name)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-secondary/60"
                  >
                    <span>
                      <span className="font-medium">{c.name}</span>
                      <span className="block text-xs text-muted-foreground">{c.customer_id}</span>
                    </span>
                    <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                ))}
                {results.length === 0 && (
                  <p className="px-1 py-4 text-sm text-muted-foreground">No customers found.</p>
                )}
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-2">
              <button
                onClick={handleIgnore}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" /> Not a customer
              </button>
              <button
                onClick={() => {
                  setQuery("");
                  setIndex((i) => Math.min(i + 1, groups.length - 1));
                }}
                disabled={busy || groups.length < 2}
                className="rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                Skip for now
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
