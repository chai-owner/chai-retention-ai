import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, Lock, Download, Users, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Card } from "@/components/ui/chai";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Waitlist Admin — ChAi" }] }),
  component: AdminPage,
});

interface WaitlistEntry {
  id: string;
  name: string;
  email: string;
  company: string;
  created_at: string;
}

function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) {
        if (active) setLoading(false);
        return;
      }

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid)
        .eq("role", "admin");

      const admin = !!roles && roles.length > 0;
      if (!active) return;
      setIsAdmin(admin);

      if (admin) {
        const { data: rows } = await supabase
          .from("waitlist")
          .select("id, name, email, company, created_at")
          .order("created_at", { ascending: false });
        if (active) setEntries(rows ?? []);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const exportCsv = () => {
    const header = ["Name", "Email", "Company", "Joined"];
    const rows = entries.map((e) => [
      e.name,
      e.email,
      e.company,
      new Date(e.created_at).toISOString(),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "chai-waitlist.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

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
          You're signed in, but this page is restricted to ChAi admins. If this should be you,
          ask for admin access to be granted to your account.
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
    <div className="mx-auto max-w-5xl px-4 py-10 lg:px-6">
      <PageHeader
        title="Waitlist"
        description="Everyone who has signed up for early access to ChAi."
      />

      <div className="mb-4 flex items-center justify-between">
        <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-sm font-medium text-muted-foreground">
          <Users className="h-4 w-4" /> {entries.length} signup{entries.length === 1 ? "" : "s"}
        </span>
        <button
          onClick={exportCsv}
          disabled={entries.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
        >
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      <Card className="overflow-hidden p-0">
        {entries.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Sparkles className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">No signups yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((e) => (
                  <tr key={e.id} className="hover:bg-accent/40">
                    <td className="px-4 py-3 font-medium">{e.name}</td>
                    <td className="px-4 py-3">
                      <a href={`mailto:${e.email}`} className="text-primary hover:underline">
                        {e.email}
                      </a>
                    </td>
                    <td className="px-4 py-3">{e.company}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(e.created_at).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
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
