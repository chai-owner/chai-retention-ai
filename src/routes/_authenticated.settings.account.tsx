import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  CheckCircle2,
  CreditCard,
  ExternalLink,
  KeyRound,
  Loader2,
  Mail,
  ShieldCheck,
  Trash2,
  UserCog,
  UserPlus,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { UpgradePlanButton } from "@/components/plan-limits";
import { supabase } from "@/integrations/supabase/client";
import { TEAM_QUERY_KEY, useTeam } from "@/lib/use-team";
import {
  PLAN_LABELS,
  ROLE_LABELS,
  canManageMembers,
  canViewBilling,
  hasSeatAvailable,
  seatsLabel,
  type InviteRole,
} from "@/lib/organisations";
import { getPaddleEnvironment } from "@/lib/paddle";
import { createBillingPortalLink, getMySubscription } from "@/utils/payments.functions";
import {
  cancelTeamInvite,
  inviteTeamMember,
  removeTeamMember,
  resendTeamInvite,
  updateTeamMemberRole,
} from "@/lib/organisations.functions";

export const Route = createFileRoute("/_authenticated/settings/account")({
  head: () => ({
    meta: [
      { title: "Account settings — ChAi" },
      {
        name: "description",
        content:
          "Reset your ChAi password, review your teammates and manage pending invitations in one place.",
      },
      { property: "og:title", content: "Account settings — ChAi" },
      {
        property: "og:description",
        content: "Password, team members and invitations for your ChAi workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <AccountSettingsPage />
    </AppShell>
  ),
});

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20";

function AccountSettingsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useTeam();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("member");

  const invite = useServerFn(inviteTeamMember);
  const cancelInvite = useServerFn(cancelTeamInvite);
  const resendInvite = useServerFn(resendTeamInvite);
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
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Couldn't send that invitation."),
  });

  const cancelMutation = useMutation({
    mutationFn: (inviteId: string) => cancelInvite({ data: { inviteId } }),
    onSuccess: () => {
      toast.success("Invitation cancelled.");
      void refresh();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Couldn't cancel that invitation."),
  });

  const resendMutation = useMutation({
    mutationFn: (inviteId: string) => resendInvite({ data: { inviteId } }),
    onSuccess: (result) => {
      toast.success(
        result?.emailQueued
          ? "Invitation re-sent."
          : "Invitation refreshed. We couldn't send the email — share the link manually.",
      );
      void refresh();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Couldn't resend that invitation."),
  });

  const roleMutation = useMutation({
    mutationFn: (input: { memberId: string; role: InviteRole }) => changeRole({ data: input }),
    onSuccess: () => {
      toast.success("Role updated.");
      void refresh();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Couldn't update that role."),
  });

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => removeMember({ data: { memberId } }),
    onSuccess: () => {
      toast.success("Teammate removed.");
      void refresh();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Couldn't remove that teammate."),
  });

  const manage = canManageMembers(data?.myRole);
  const seatFull = data ? !hasSeatAvailable(data.organisation.plan, data.seatsUsed) : false;
  const pendingInvites = (data?.invites ?? []).filter((i) => !i.expired);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
          <UserCog className="h-6 w-6 text-primary" />
          Account settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Your password, the people in your workspace and any invitations still waiting to
          be accepted.
        </p>
      </header>

      <ResetPasswordSection />

      {!isLoading && data && <BillingSection plan={data.organisation.plan} role={data.myRole} />}

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
          <section className="rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Users className="h-4 w-4 text-primary" /> Team members ({data.members.length})
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                <ShieldCheck className="h-3.5 w-3.5" />
                You're {ROLE_LABELS[data.myRole].toLowerCase()}
              </span>
            </div>
            <ul className="divide-y divide-border">
              {data.members.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {m.name || m.email || "Teammate"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.email}
                      {m.joinedAt
                        ? ` · Joined ${new Date(m.joinedAt).toLocaleDateString()}`
                        : " · Invitation pending"}
                    </p>
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
                      aria-label={`Role for ${m.email || "teammate"}`}
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
            {!manage && (
              <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
                Only your workspace owner and admins can change roles or remove teammates.
              </p>
            )}
          </section>

          {manage && (
            <section className="rounded-xl border border-border bg-card">
              <div className="border-b border-border px-5 py-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Mail className="h-4 w-4 text-primary" /> Invites ({pendingInvites.length})
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {PLAN_LABELS[data.organisation.plan]} plan ·{" "}
                  {seatsLabel(data.organisation.plan, data.seatsUsed)}
                </p>
              </div>

              {data.invites.length > 0 && (
                <ul className="divide-y divide-border">
                  {data.invites.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
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
                        variant="outline"
                        size="sm"
                        onClick={() => resendMutation.mutate(i.id)}
                        disabled={resendMutation.isPending}
                      >
                        Resend
                      </Button>
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
              )}

              <form
                className="flex flex-col gap-3 border-t border-border p-5 sm:flex-row"
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
                  aria-label="Invite email address"
                />
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value === "admin" ? "admin" : "member")}
                  className={inputCls + " sm:w-40"}
                  aria-label="Invite role"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
                <Button
                  type="submit"
                  disabled={seatFull || inviteMutation.isPending}
                  className="sm:w-44"
                >
                  {inviteMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4" /> Invite member
                    </>
                  )}
                </Button>
              </form>
              {seatFull && (
                <div className="flex flex-wrap items-center gap-3 px-5 pb-5">
                  <p className="text-xs text-muted-foreground">
                    Every seat on the {PLAN_LABELS[data.organisation.plan]} plan is in use.
                    Upgrade your plan or remove a teammate to invite someone new.
                  </p>
                  <UpgradePlanButton plan={data.organisation.plan} />
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** Trial countdown for accounts that haven't subscribed yet. */
function TrialSummary() {
  const { data } = useAccessState(true);
  if (!data || data.trial.status === "none") return null;
  const endsAt = data.trial.endsAt ? new Date(data.trial.endsAt).toLocaleDateString() : null;
  if (data.trial.status === "trialing") {
    return (
      <p className="rounded-lg bg-primary/10 px-3 py-2 text-primary">
        Free trial: {data.trial.daysLeft} {data.trial.daysLeft === 1 ? "day" : "days"} left
        {endsAt ? ` — ends ${endsAt}` : ""}. You have full Standard access until then.
      </p>
    );
  }
  if (data.trial.status === "grace") {
    return (
      <p className="rounded-lg bg-warning/10 px-3 py-2 text-warning">
        Your trial ended{endsAt ? ` on ${endsAt}` : ""}. {data.trial.daysLeft}{" "}
        {data.trial.daysLeft === 1 ? "day" : "days"} of access left before your workspace locks.
      </p>
    );
  }
  return (
    <p className="rounded-lg bg-destructive/10 px-3 py-2 text-destructive">
      Your free trial has ended and your workspace is locked. Choose a plan to unlock it.
    </p>
  );
}

function BillingSection({ plan, role }: { plan: keyof typeof PLAN_LABELS; role: string }) {
  const environment = getPaddleEnvironment();
  const getSub = useServerFn(getMySubscription);
  const portalLink = useServerFn(createBillingPortalLink);

  const { data: sub } = useQuery({
    queryKey: ["billing-subscription", environment],
    queryFn: () => getSub({ data: { environment } }),
    staleTime: 60_000,
  });

  const portal = useMutation({
    mutationFn: () => portalLink({ data: { environment } }),
    onSuccess: ({ url }) => window.open(url, "_blank", "noopener"),
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "We couldn't open the billing portal."),
  });

  const active = sub && ["active", "trialing", "past_due"].includes(sub.status);
  const canManage = canViewBilling(role as never);
  const renewsAt = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : null;

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <CreditCard className="h-4 w-4 text-primary" /> Billing
        </h2>
        {active && (
          <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium capitalize text-secondary-foreground">
            {sub?.status === "past_due" ? "Payment issue" : sub?.status}
          </span>
        )}
      </div>

      <div className="space-y-3 px-5 py-4 text-sm">
        <TrialSummary />
        <p className="text-foreground">
          You're on the <strong>{PLAN_LABELS[plan]}</strong> plan
          {sub?.period ? ` (${sub.period === "annual" ? "annual" : "monthly"} billing)` : ""}.
        </p>

        {active && renewsAt && !sub?.cancelAtPeriodEnd && (
          <p className="text-muted-foreground">Renews on {renewsAt}.</p>
        )}
        {sub?.cancelAtPeriodEnd && renewsAt && (
          <p className="text-warning">
            Cancellation scheduled — you keep access until {renewsAt}.
          </p>
        )}
        {sub?.pendingPlan && (
          <p className="text-muted-foreground">
            Your plan changes to <strong>{PLAN_LABELS[sub.pendingPlan]}</strong>
            {sub.pendingPlanEffectiveAt
              ? ` on ${new Date(sub.pendingPlanEffectiveAt).toLocaleDateString()}`
              : " at your next renewal"}
            .
          </p>
        )}
        {sub?.status === "past_due" && (
          <p className="text-warning">
            Your last payment didn't go through. Update your payment method to keep your plan.
          </p>
        )}
        {!active && (
          <p className="text-muted-foreground">
            No active subscription on this account. Choose a plan to unlock your full limits.
          </p>
        )}
      </div>

      {canManage && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-4">
          <UpgradePlanButton plan={plan} />
          {active ? (
            <Button variant="outline" size="sm" onClick={() => portal.mutate()} disabled={portal.isPending}>
              {portal.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              Manage billing
            </Button>
          ) : (
            <Button variant="outline" size="sm" asChild>
              <Link to="/pricing">See plans</Link>
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            Update your card, download invoices or cancel in the billing portal.
          </p>
        </div>
      )}
      {!canManage && (
        <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
          Only your workspace owner can change billing.
        </p>
      )}
    </section>
  );
}

function ResetPasswordSection() {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function sendResetLink(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      const { data } = await supabase.auth.getUser();
      const address = data.user?.email;
      if (!address) {
        toast.error("We couldn't find an email address on your account.");
        return;
      }
      const { error } = await supabase.auth.resetPasswordForEmail(address, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      setSent(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <KeyRound className="h-4 w-4 text-primary" /> Reset password
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        We'll email you a secure link to choose a new password. The link expires shortly
        after it's sent.
      </p>
      {sent ? (
        <p className="mt-4 flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm text-secondary-foreground">
          <CheckCircle2 className="h-4 w-4" />
          Reset link sent — check your inbox.
        </p>
      ) : (
        <form className="mt-4" onSubmit={sendResetLink}>
          <Button type="submit" disabled={sending}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send reset link"}
          </Button>
        </form>
      )}
    </section>
  );
}
