// Whether the signed-in user may use the app: trial phase, plan limits in
// force, and whether their seat has been locked by a downgrade.
import { createServerFn } from "@tanstack/react-start";

import { requireConnectedAuth } from "@/lib/connected-auth-middleware";
import { coercePlan, customersAllowed, seatsAllowed, type OrgPlan, type OrgRole } from "@/lib/organisations";
import { effectivePlan, trialState, type TrialState } from "@/lib/trials";

export interface AccessState {
  plan: OrgPlan;
  /** The plan whose limits actually apply right now (Standard during a trial). */
  effectivePlan: OrgPlan;
  role: OrgRole | null;
  organisationName: string;
  trial: TrialState;
  /** True when this member's seat was locked by a downgrade. */
  seatLocked: boolean;
  /** True when the trial and its grace period have both run out. */
  paywalled: boolean;
  customersAllowed: number | null;
  seatsAllowed: number | null;
}

type Ctx = { supabase: any; userId: string };

export const getAccessState = createServerFn({ method: "GET" })
  .middleware([requireConnectedAuth])
  .handler(async ({ context }): Promise<AccessState> => {
    const ctx = context as unknown as Ctx;
    // A brand-new account may not have an organisation yet; create it (with its
    // trial window) so trial state and limits are always defined.
    try {
      const { ensureOrganisationForUser } = await import("@/lib/organisation-provision.server");
      await ensureOrganisationForUser(ctx.userId);
    } catch {
      // Provisioning is best-effort — never block the access check.
    }
    const { data } = await ctx.supabase
      .from("organisation_members")
      .select("role, locked, organisations(name, plan, trial_ends_at)")
      .eq("user_id", ctx.userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const org = Array.isArray(data?.organisations) ? data?.organisations[0] : data?.organisations;
    const plan = coercePlan(org?.plan);
    const trial = trialState(org?.trial_ends_at ?? null);
    const active = effectivePlan(plan, trial);

    return {
      plan,
      effectivePlan: active,
      role: (data?.role ?? null) as OrgRole | null,
      organisationName: org?.name ?? "",
      trial,
      seatLocked: Boolean(data?.locked),
      paywalled: trial.status === "expired",
      customersAllowed: customersAllowed(active),
      seatsAllowed: seatsAllowed(active),
    };
  });
