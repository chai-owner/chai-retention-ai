import { createServerFn } from "@tanstack/react-start";
import { requireConnectedAuth } from "@/lib/connected-auth-middleware";
import {
  INVITE_TTL_DAYS,
  canChangeRole,
  canManageMembers,
  canRemoveMember,
  hasSeatAvailable,
  inviteExpiryFrom,
  isInviteExpired,
  isOrgPlan,
  isOrgRole,
  isValidEmail,
  normaliseEmail,
  seatsAllowed,
  seatsUsed,
  ROLE_LABELS,
  inviteAcceptUrl,
  type InviteRole,
  type OrgPlan,
  type OrgRole,
} from "@/lib/organisations";

// Emails always point at the stable production site; never at a caller-supplied
// origin, which would make the invite link forgeable.
const SITE_ORIGIN = "https://chai-retention-ai.lovable.app";
const SITE_NAME = "chai-retention-ai";
const SENDER_DOMAIN = "notify.askchai.tech";
const FROM_DOMAIN = "askchai.tech";

export interface TeamMember {
  id: string;
  userId: string;
  role: OrgRole;
  name: string;
  email: string;
  joinedAt: string | null;
  invitedAt: string;
}

export interface TeamInvite {
  id: string;
  email: string;
  role: InviteRole;
  expiresAt: string;
  createdAt: string;
  expired: boolean;
}

export interface TeamSnapshot {
  organisation: { id: string; name: string; plan: OrgPlan };
  myRole: OrgRole;
  members: TeamMember[];
  invites: TeamInvite[];
  seatsUsed: number;
  seatsAllowed: number | null;
}

type Ctx = { supabase: any; userId: string };

async function loadMembership(context: Ctx) {
  const { data, error } = await context.supabase
    .from("organisation_members")
    .select("org_id, role, organisations(id, name, plan)")
    .eq("user_id", context.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.org_id) throw new Error("You're not part of a team yet.");
  const org = (data as any).organisations;
  return {
    orgId: data.org_id as string,
    role: (isOrgRole(data.role) ? data.role : "member") as OrgRole,
    organisation: {
      id: org?.id ?? data.org_id,
      name: org?.name ?? "My organisation",
      plan: (isOrgPlan(org?.plan) ? org.plan : "starter") as OrgPlan,
    },
  };
}

export const getMyTeam = createServerFn({ method: "GET" })
  .middleware([requireConnectedAuth])
  .handler(async ({ context }): Promise<TeamSnapshot> => {
    const membership = await loadMembership(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: memberRows, error: memberError } = await supabaseAdmin
      .from("organisation_members")
      .select("id, user_id, role, invited_at, accepted_at")
      .eq("org_id", membership.orgId)
      .order("created_at", { ascending: true });
    if (memberError) throw new Error(memberError.message);

    const ids = (memberRows ?? []).map((m: any) => m.user_id);
    const { data: profiles } = ids.length
      ? await supabaseAdmin.from("profiles").select("id, full_name, email").in("id", ids)
      : { data: [] as any[] };
    const byId = new Map((profiles ?? []).map((p: any) => [p.id, p]));

    const members: TeamMember[] = (memberRows ?? []).map((m: any) => ({
      id: m.id,
      userId: m.user_id,
      role: (isOrgRole(m.role) ? m.role : "member") as OrgRole,
      name: byId.get(m.user_id)?.full_name || "",
      email: byId.get(m.user_id)?.email || "",
      joinedAt: m.accepted_at ?? null,
      invitedAt: m.invited_at,
    }));

    let invites: TeamInvite[] = [];
    if (canManageMembers(membership.role)) {
      const { data: inviteRows, error: inviteError } = await supabaseAdmin
        .from("organisation_invites")
        .select("id, email, role, expires_at, created_at, accepted_at")
        .eq("org_id", membership.orgId)
        .is("accepted_at", null)
        .order("created_at", { ascending: false });
      if (inviteError) throw new Error(inviteError.message);
      invites = (inviteRows ?? []).map((i: any) => ({
        id: i.id,
        email: i.email,
        role: (i.role === "admin" ? "admin" : "member") as InviteRole,
        expiresAt: i.expires_at,
        createdAt: i.created_at,
        expired: isInviteExpired(i.expires_at),
      }));
    }

    const pending = invites.filter((i) => !i.expired).length;
    return {
      organisation: membership.organisation,
      myRole: membership.role,
      members,
      invites,
      seatsUsed: seatsUsed(members.length, pending),
      seatsAllowed: seatsAllowed(membership.organisation.plan),
    };
  });

export const inviteTeamMember = createServerFn({ method: "POST" })
  .middleware([requireConnectedAuth])
  .inputValidator((input: { email: string; role: InviteRole }) => {
    const email = normaliseEmail(String(input?.email ?? ""));
    if (!isValidEmail(email)) throw new Error("Enter a valid email address.");
    const role: InviteRole = input?.role === "admin" ? "admin" : "member";
    return { email, role };
  })
  .handler(async ({ data, context }) => {
    const membership = await loadMembership(context as Ctx);
    if (!canManageMembers(membership.role)) {
      throw new Error("You don't have permission to invite people.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ count: memberCount }, { data: pendingInvites }] = await Promise.all([
      supabaseAdmin
        .from("organisation_members")
        .select("id", { count: "exact", head: true })
        .eq("org_id", membership.orgId),
      supabaseAdmin
        .from("organisation_invites")
        .select("id, email, expires_at")
        .eq("org_id", membership.orgId)
        .is("accepted_at", null),
    ]);

    const livePending = (pendingInvites ?? []).filter((i: any) => !isInviteExpired(i.expires_at));
    const used = seatsUsed(memberCount ?? 0, livePending.length);
    if (!hasSeatAvailable(membership.organisation.plan, used)) {
      throw new Error(
        "You've used every seat on your plan. Upgrade your plan or remove a member to invite someone new.",
      );
    }
    if (livePending.some((i: any) => normaliseEmail(i.email) === data.email)) {
      throw new Error("That person already has a pending invitation.");
    }

    // Drop any expired invite for the same address so the token stays unique-ish
    // and the team list stays clean.
    await supabaseAdmin
      .from("organisation_invites")
      .delete()
      .eq("org_id", membership.orgId)
      .is("accepted_at", null)
      .ilike("email", data.email);

    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const expiresAt = inviteExpiryFrom().toISOString();

    const { error: insertError } = await supabaseAdmin.from("organisation_invites").insert({
      org_id: membership.orgId,
      email: data.email,
      role: data.role,
      token,
      invited_by: (context as Ctx).userId,
      expires_at: expiresAt,
    });
    if (insertError) throw new Error(insertError.message);

    // Email delivery is best-effort: the invite itself is already saved, and the
    // link can be re-sent from the Team page if the queue is unavailable.
    let emailQueued = false;
    try {
      const [{ render }, React, { OrgInviteEmail }] = await Promise.all([
        import("@react-email/render"),
        import("react"),
        import("@/lib/email-templates/org-invite"),
      ]);
      const { data: inviterProfile } = await supabaseAdmin
        .from("profiles")
        .select("full_name, email")
        .eq("id", (context as Ctx).userId)
        .maybeSingle();

      const element = React.createElement(OrgInviteEmail, {
        organisationName: membership.organisation.name || "your team",
        inviterName: inviterProfile?.full_name || inviterProfile?.email || "A teammate",
        roleLabel: ROLE_LABELS[data.role],
        acceptUrl: inviteAcceptUrl(SITE_ORIGIN, token),
        expiresInDays: INVITE_TTL_DAYS,
      });
      const html = await render(element);
      const text = await render(element, { plainText: true });
      const messageId = crypto.randomUUID();

      await supabaseAdmin.from("email_send_log").insert({
        message_id: messageId,
        template_name: "org_invite",
        recipient_email: data.email,
        status: "pending",
      });

      const { error: enqueueError } = await supabaseAdmin.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          message_id: messageId,
          to: data.email,
          from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
          sender_domain: SENDER_DOMAIN,
          subject: `You've been invited to join ${membership.organisation.name || "a team"} on ChAi`,
          html,
          text,
          purpose: "transactional",
          label: "org_invite",
          queued_at: new Date().toISOString(),
        },
      });
      emailQueued = !enqueueError;
    } catch (error) {
      console.error("Failed to send organisation invite email", error);
    }

    return { ok: true as const, emailQueued, acceptUrl: inviteAcceptUrl(SITE_ORIGIN, token) };
  });

export const cancelTeamInvite = createServerFn({ method: "POST" })
  .middleware([requireConnectedAuth])
  .inputValidator((input: { inviteId: string }) => ({ inviteId: String(input?.inviteId ?? "") }))
  .handler(async ({ data, context }) => {
    const membership = await loadMembership(context as Ctx);
    if (!canManageMembers(membership.role)) throw new Error("You don't have permission to do that.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("organisation_invites")
      .delete()
      .eq("id", data.inviteId)
      .eq("org_id", membership.orgId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const updateTeamMemberRole = createServerFn({ method: "POST" })
  .middleware([requireConnectedAuth])
  .inputValidator((input: { memberId: string; role: InviteRole }) => ({
    memberId: String(input?.memberId ?? ""),
    role: (input?.role === "admin" ? "admin" : "member") as InviteRole,
  }))
  .handler(async ({ data, context }) => {
    const membership = await loadMembership(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target, error: targetError } = await supabaseAdmin
      .from("organisation_members")
      .select("id, role, user_id")
      .eq("id", data.memberId)
      .eq("org_id", membership.orgId)
      .maybeSingle();
    if (targetError) throw new Error(targetError.message);
    if (!target) throw new Error("That team member no longer exists.");

    const check = canChangeRole(membership.role, target.role as OrgRole, data.role);
    if (!check.allowed) throw new Error(check.reason ?? "Not allowed.");

    const { error } = await supabaseAdmin
      .from("organisation_members")
      .update({ role: data.role })
      .eq("id", data.memberId)
      .eq("org_id", membership.orgId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const removeTeamMember = createServerFn({ method: "POST" })
  .middleware([requireConnectedAuth])
  .inputValidator((input: { memberId: string }) => ({ memberId: String(input?.memberId ?? "") }))
  .handler(async ({ data, context }) => {
    const membership = await loadMembership(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target, error: targetError } = await supabaseAdmin
      .from("organisation_members")
      .select("id, role, user_id")
      .eq("id", data.memberId)
      .eq("org_id", membership.orgId)
      .maybeSingle();
    if (targetError) throw new Error(targetError.message);
    if (!target) throw new Error("That team member no longer exists.");

    const check = canRemoveMember(membership.role, target.role as OrgRole);
    if (!check.allowed) throw new Error(check.reason ?? "Not allowed.");

    const { error } = await supabaseAdmin
      .from("organisation_members")
      .delete()
      .eq("id", data.memberId)
      .eq("org_id", membership.orgId);
    if (error) throw new Error(error.message);

    // A removed teammate keeps their account: give them a fresh solo workspace.
    const { data: orphan } = await supabaseAdmin
      .from("organisation_members")
      .select("id")
      .eq("user_id", target.user_id)
      .maybeSingle();
    if (!orphan) {
      const { data: newOrg } = await supabaseAdmin
        .from("organisations")
        .insert({ name: "My organisation", owner_id: target.user_id })
        .select("id")
        .maybeSingle();
      if (newOrg?.id) {
        await supabaseAdmin.from("organisation_members").insert({
          org_id: newOrg.id,
          user_id: target.user_id,
          role: "owner",
          accepted_at: new Date().toISOString(),
        });
      }
    }
    return { ok: true as const };
  });

export const acceptTeamInvite = createServerFn({ method: "POST" })
  .middleware([requireConnectedAuth])
  .inputValidator((input: { token: string }) => ({ token: String(input?.token ?? "") }))
  .handler(async ({ data, context }) => {
    const userId = (context as Ctx).userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("organisation_invites")
      .select("id, org_id, email, role, expires_at, accepted_at, organisations(name, plan)")
      .eq("token", data.token)
      .maybeSingle();
    if (inviteError) throw new Error(inviteError.message);
    if (!invite) throw new Error("That invitation link isn't valid.");
    if (invite.accepted_at) throw new Error("That invitation has already been used.");
    if (isInviteExpired(invite.expires_at)) throw new Error("That invitation has expired. Ask for a new one.");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", userId)
      .maybeSingle();
    if (normaliseEmail(profile?.email ?? "") !== normaliseEmail(invite.email)) {
      throw new Error("This invitation was sent to a different email address.");
    }

    const { data: existing } = await supabaseAdmin
      .from("organisation_members")
      .select("id, org_id, role")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing?.org_id === invite.org_id) {
      await supabaseAdmin
        .from("organisation_invites")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", invite.id);
      return { ok: true as const, organisationName: (invite as any).organisations?.name ?? "" };
    }

    if (existing) {
      const { count } = await supabaseAdmin
        .from("organisation_members")
        .select("id", { count: "exact", head: true })
        .eq("org_id", existing.org_id);
      if (existing.role !== "owner" || (count ?? 0) > 1) {
        throw new Error("Leave your current team before joining another one.");
      }
      // Solo workspace: retire it so the user has exactly one organisation.
      const { error: dropError } = await supabaseAdmin
        .from("organisations")
        .delete()
        .eq("id", existing.org_id);
      if (dropError) throw new Error(dropError.message);
    }

    const plan = (isOrgPlan((invite as any).organisations?.plan)
      ? (invite as any).organisations.plan
      : "starter") as OrgPlan;
    const { count: memberCount } = await supabaseAdmin
      .from("organisation_members")
      .select("id", { count: "exact", head: true })
      .eq("org_id", invite.org_id);
    if (!hasSeatAvailable(plan, memberCount ?? 0)) {
      throw new Error("That team has no seats left. Ask the owner to upgrade their plan.");
    }

    const { error: joinError } = await supabaseAdmin.from("organisation_members").insert({
      org_id: invite.org_id,
      user_id: userId,
      role: invite.role,
      accepted_at: new Date().toISOString(),
    });
    if (joinError) throw new Error(joinError.message);

    await supabaseAdmin
      .from("organisation_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invite.id);

    return { ok: true as const, organisationName: (invite as any).organisations?.name ?? "" };
  });
