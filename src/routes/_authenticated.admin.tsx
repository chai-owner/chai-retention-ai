import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Lock, Loader2, Users, Cpu, Lock as LockIcon, Unlock, LogIn, CalendarCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Card } from "@/components/ui/chai";
import {
  listCustomers,
  setUnlocked,
  startImpersonation,
  type AdminCustomer,
} from "@/lib/admin.functions";
import { impersonationStore } from "@/lib/impersonation";

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

  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try {
      const rows = await fetchCustomers();
      setCustomers(rows as AdminCustomer[]);
      setIsAdmin(true);
    } catch {
      setIsAdmin(false);
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
      impersonationStore.start({
        adminSession: sess.session,
        targetName: c.fullName,
        targetEmail: c.email,
        auditId: res.auditId,
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

  const totalTokens = customers.reduce((s, c) => s + c.totalTokens, 0);

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
        <h1 className="mt-4 text-xl font-semibold">Admin access only</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You're signed in, but this page is restricted to ChAi admins.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Back to home
        </Link>
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
        <Stat icon={Cpu} label="Total AI tokens" value={totalTokens.toLocaleString()} />
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
                  <th className="px-4 py-3 font-medium">AI tokens</th>
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
                    <td className="px-4 py-3 tabular-nums">{c.totalTokens.toLocaleString()}</td>
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
