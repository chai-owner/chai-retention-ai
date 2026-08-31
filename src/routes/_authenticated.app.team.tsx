import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Mail, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { TEAM_QUERY_KEY, useTeam } from "@/lib/use-team";
import {
  PLAN_LABELS,
  ROLE_LABELS,
  canManageMembers,
  hasSeatAvailable,
  seatsLabel,
  type InviteRole,
} from "@/lib/organisations";
import {
  cancelTeamInvite,
  inviteTeamMember,
  removeTeamMember,
  updateTeamMemberRole,
} from "@/lib/organisations.functions";

export const Route = createFileRoute("/_authenticated/app/team")({
  head: () => ({
    meta: [
      { title: "Team & access — ChAi" },
      {
        name: "description",
        content:
          "Invite teammates, manage roles and keep track of the seats included with your ChAi plan.",
      },
      { property: "og:title", content: "Team & access — ChAi" },
      {
        property: "og:description",
        content: "Invite teammates, manage roles and seats in your ChAi workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TeamPage,
});

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20";

function TeamPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useTeam();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("member");

  const invite = useServerFn(inviteTeamMember);
  const cancelInvite = useServerFn(cancelTeamInvite);
  const changeRole = useServerFn(updateTeamMemberRole);
  const removeMember = useServerFn(removeTeamMember);

  const refresh = () => queryClient.invalidateQueries({ queryKey: TEAM_QUERY_KEY });

  const inviteMutation = useMutation({
    mutationFn: (input: { email: string; role: InviteRole }) => invite({ data: input }),
    onSuccess: (result) => {
      setEmail("");
      toast.success(
        result?.emailQueued
          ? "Invitation sent."
          : "Invitation created. We couldn't send the email — share the link manually.",
      );
      void refresh();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Couldn't send that invitation."),
  });

  const cancelMutation = useMutation({
    mutationFn: (inviteId: string) => cancelInvite({ data: { inviteId } }),
    onSuccess: () => {
      toast.success("Invitation cancelled.");
      void refresh();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Couldn't cancel that invitation."),
  });

  const roleMutation = useMutation({
    mutationFn: (input: { memberId: string; role: InviteRole }) => changeRole({ data: input }),
    onSuccess: () => {
      toast.success("Role updated.");
      void refresh();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Couldn't update that role."),
  });

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => removeMember({ data: { memberId } }),
    onSuccess: () => {
      toast.success("Teammate removed.");
      void refresh();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Couldn't remove that teammate."),
  });

  const manage = canManageMembers(data?.myRole);
  const seatFull = data ? !hasSeatAvailable(data.organisation.plan, data.seatsUsed) : false;

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <header className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <Users className="h-6 w-6 text-primary" />
            Team &amp; access
          </h1>
          <p className="text-sm text-muted-foreground">
            Invite the people you work with, decide what they can do, and keep an eye on
            the seats included with your plan.
          </p>
        </header>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your team…
          </div>
        ) : error || !data ? (
          <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "We couldn't load your team just now."}
          </div>
        ) : (
          <>
            <section className="rounded-xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {data.organisation.name || "Your organisation"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {PLAN_LABELS[data.organisation.plan]} plan ·{" "}
                    {seatsLabel(data.organisation.plan, data.seatsUsed)}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  You're {ROLE_LABELS[data.myRole].toLowerCase()}
                </span>
              </div>
            </section>

            {manage && (
              <section className="rounded-xl border border-border bg-card p-5">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <UserPlus className="h-4 w-4 text-primary" /> Invite someone
                </h2>
                <form
                  className="flex flex-col gap-3 sm:flex-row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    inviteMutation.mutate({ email, role });
                  }}
                >
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="teammate@company.com"
                    className={inputCls}
                  />
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value === "admin" ? "admin" : "member")}
                    className={inputCls + " sm:w-40"}
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                  <Button type="submit" disabled={seatFull || inviteMutation.isPending} className="sm:w-40">
                    {inviteMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Send invite"
                    )}
                  </Button>
                </form>
                {seatFull && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Every seat on the {PLAN_LABELS[data.organisation.plan]} plan is in use.
                    Upgrade your plan or remove a teammate to invite someone new.
                  </p>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  Admins can manage the team, integrations and business profile. Members see
                  the retention workspace only.
                </p>
              </section>
            )}

            <section className="rounded-xl border border-border bg-card">
              <h2 className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground">
                Members ({data.members.length})
              </h2>
              <ul className="divide-y divide-border">
                {data.members.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {m.name || m.email || "Teammate"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                    </div>
                    {manage && m.role !== "owner" ? (
                      <select
                        value={m.role}
                        onChange={(e) =>
                          roleMutation.mutate({
                            memberId: m.id,
                            role: e.target.value === "admin" ? "admin" : "member",
                          })
                        }
                        className={inputCls + " w-32"}
                        disabled={roleMutation.isPending}
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                    ) : (
                      <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                        {ROLE_LABELS[m.role]}
                      </span>
                    )}
                    {manage && m.role !== "owner" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeMutation.mutate(m.id)}
                        disabled={removeMutation.isPending}
                        aria-label={`Remove ${m.email || "teammate"}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            {manage && data.invites.length > 0 && (
              <section className="rounded-xl border border-border bg-card">
                <h2 className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground">
                  Pending invitations
                </h2>
                <ul className="divide-y divide-border">
                  {data.invites.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-foreground">{i.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {ROLE_LABELS[i.role]} ·{" "}
                          {i.expired
                            ? "Expired"
                            : `Expires ${new Date(i.expiresAt).toLocaleDateString()}`}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => cancelMutation.mutate(i.id)}
                        disabled={cancelMutation.isPending}
                      >
                        Cancel
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
