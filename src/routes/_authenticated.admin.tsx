import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Lock, Loader2, Users, Cpu, Lock as LockIcon, Unlock, LogIn, CalendarCheck, Eye, Eraser } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Card } from "@/components/ui/chai";
import {
  listCustomers,
  listDemoLeads,
  type DemoLead,
  setUnlocked,
  startImpersonation,
  resetAccount,
  type AdminCustomer,
} from "@/lib/admin.functions";
import { clearPersistedImpersonatedAuth, impersonationStore } from "@/lib/impersonation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Customer Admin — ChAi" }] }),
  component: AdminPage,
});

function AdminPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchCustomers = useServerFn(listCustomers);
  const toggleUnlock = useServerFn(setUnlocked);
  const impersonate = useServerFn(startImpersonation);
  const wipeAccount = useServerFn(resetAccount);

  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<AdminCustomer | null>(null);
  const fetchDemoLeads = useServerFn(listDemoLeads);
  const [demoLeads, setDemoLeads] = useState<DemoLead[]>([]);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await fetchCustomers();
      setCustomers(rows as AdminCustomer[]);
      setIsAdmin(true);
      try {
        setDemoLeads((await fetchDemoLeads()) as DemoLead[]);
      } catch {
        setDemoLeads([]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setIsAdmin(false);
      // Only a real role failure means "not an admin"; anything else (expired
      // session, network, server error) should be reported so it can be retried.
      setLoadError(/forbidden/i.test(message) ? null : message);
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUnlock(c: AdminCustomer) {
    setBusyId(c.id);
    try {
      await toggleUnlock({ data: { userId: c.id, unlocked: !c.unlocked } });
      setCustomers((list) =>
        list.map((x) => (x.id === c.id ? { ...x, unlocked: !c.unlocked } : x)),
      );
      toast.success(!c.unlocked ? "Account unlocked" : "Account locked");
    } catch {
      toast.error("Couldn't update this account");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReset(c: AdminCustomer) {
    const label = c.company || c.fullName || c.email;
    setResetTarget(null);
    setBusyId(c.id);
    try {
      await wipeAccount({ data: { userId: c.id } });
      setCustomers((list) =>
        list.map((x) => (x.id === c.id ? { ...x, onboarded: false, company: "" } : x)),
      );
      toast.success(`${label} reset — account is empty and back at onboarding`);
    } catch {
      toast.error("Couldn't reset this account");
    } finally {
      setBusyId(null);
    }
  }

  async function handleImpersonate(c: AdminCustomer) {
    setBusyId(c.id);
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) throw new Error("No admin session");
      const res = await impersonate({ data: { userId: c.id } });
      const { error } = await supabase.auth.verifyOtp({
        type: "magiclink",
        token_hash: res.tokenHash,
      });
      if (error) throw error;
       clearPersistedImpersonatedAuth();
      impersonationStore.start({
        adminSession: sess.session,
         targetUserId: c.id,
        targetName: c.fullName,
        targetEmail: c.email,
        auditId: res.auditId,
         expiresAt: res.expiresAt,
      });
      await queryClient.cancelQueries();
      queryClient.clear();
      toast.success(`Now viewing as ${c.fullName || c.email}`);
      navigate({ to: "/app/welcome" });
    } catch {
      toast.error("Couldn't start impersonation");
      setBusyId(null);
    }
  }

  const totalCostUsd = customers.reduce((s, c) => s + c.totalCostUsd, 0);
  const formatCost = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: n > 0 && n < 1 ? 4 : 2,
      maximumFractionDigits: n > 0 && n < 1 ? 4 : 2,
    }).format(n);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
          <Lock className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-xl font-semibold">
          {loadError ? "Couldn't load the admin console" : "Admin access only"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {loadError
            ? "Your session may have expired. Try again — if it keeps failing, sign out and back in."
            : "You're signed in, but this page is restricted to ChAi admins."}
        </p>
        {loadError && (
          <p className="mt-2 break-words text-xs text-muted-foreground/80">{loadError}</p>
        )}
        <div className="mt-6 flex items-center justify-center gap-2">
          {loadError && (
            <button
              onClick={async () => {
                await supabase.auth.refreshSession();
                void load();
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Try again
            </button>
          )}
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Back to home
          </Link>
        </div>
      </div>
    );
  }


  return (
    <div className="mx-auto max-w-6xl px-4 py-10 lg:px-6">
      <PageHeader
        title="Customer accounts"
        description="Manage customer accounts, unlock full dashboards, monitor AI usage, and impersonate accounts to help."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat icon={Users} label="Customers" value={String(customers.length)} />
        <Stat
          icon={Unlock}
          label="Unlocked"
          value={String(customers.filter((c) => c.unlocked).length)}
        />
        <Stat icon={Cpu} label="Total AI cost" value={formatCost(totalCostUsd)} />
      </div>

      <Card className="overflow-hidden p-0">
        {customers.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-muted-foreground">
            No customers yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">AI cost</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-accent/40">
                    <td className="px-4 py-3">
                      <div className="font-medium">{c.fullName || "—"}</div>
                      <a href={`mailto:${c.email}`} className="text-xs text-primary hover:underline">
                        {c.email}
                      </a>
                    </td>
                    <td className="px-4 py-3">{c.company || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge
                          tone={c.onboarded ? "success" : "muted"}
                          label={c.onboarded ? "Onboarded" : "In onboarding"}
                        />
                        <Badge
                          tone={c.unlocked ? "success" : "warning"}
                          label={c.unlocked ? "Unlocked" : "Locked"}
                        />
                        {c.bookedAt && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-success">
                            <CalendarCheck className="h-3 w-3" /> Booked
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{formatCost(c.totalCostUsd)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleUnlock(c)}
                          disabled={busyId === c.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
                        >
                          {c.unlocked ? (
                            <>
                              <LockIcon className="h-3.5 w-3.5" /> Lock
                            </>
                          ) : (
                            <>
                              <Unlock className="h-3.5 w-3.5" /> Unlock
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => setResetTarget(c)}
                          disabled={busyId === c.id}
                          title="Delete all data and restart onboarding"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                        >
                          <Eraser className="h-3.5 w-3.5" /> Reset data
                        </button>
                        <button
                          onClick={() => handleImpersonate(c)}
                          disabled={busyId === c.id}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                        >
                          {busyId === c.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <LogIn className="h-3.5 w-3.5" />
                          )}
                          Log in as
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-10">
        <PageHeader
          title="Demo requests"
          description="People who entered their details to view the ChAi demo."
        />
        <Card className="overflow-hidden p-0">
          {demoLeads.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-muted-foreground">
              No demo requests yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Company</th>
                    <th className="px-4 py-3 font-medium">Website</th>
                    <th className="px-4 py-3 font-medium">Requested</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {demoLeads.map((l) => (
                    <tr key={l.id} className="hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 font-medium">
                          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                          {l.name || "\u2014"}
                        </div>
                        <a href={`mailto:${l.email}`} className="text-xs text-primary hover:underline">
                          {l.email}
                        </a>
                      </td>
                      <td className="px-4 py-3">{l.company || "\u2014"}</td>
                      <td className="px-4 py-3">
                        {l.website ? (
                          <a
                            href={l.website.startsWith("http") ? l.website : `https://${l.website}`}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-primary hover:underline"
                          >
                            {l.website}
                          </a>
                        ) : (
                          "\u2014"
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(l.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <AlertDialog
        open={resetTarget !== null}
        onOpenChange={(open) => {
          if (!open) setResetTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete all data for{" "}
              {resetTarget
                ? resetTarget.company || resetTarget.fullName || resetTarget.email
                : ""}
              ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes everything this user uploaded — CSV and Data Drop
              imports, customers, transactions, usage, support tickets and surveys — plus
              connected integrations, saved customer links and their business profile. They
              will be sent back to the start of onboarding. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => resetTarget && handleReset(resetTarget)}
            >
              Yes, delete all data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}

function Badge({ tone, label }: { tone: "success" | "warning" | "muted"; label: string }) {
  const cls =
    tone === "success"
      ? "bg-success/10 text-success"
      : tone === "warning"
        ? "bg-warning/15 text-warning-foreground"
        : "bg-secondary text-muted-foreground";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{label}</span>
  );
}
