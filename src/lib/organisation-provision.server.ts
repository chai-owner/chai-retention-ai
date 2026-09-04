// Makes sure every signed-in user owns an organisation with a trial window.
//
// New accounts used to get their organisation from a database signup trigger.
// That trigger is not attached on this project, so an account created through
// sign-up would have no organisation at all — no trial, no plan limits, and no
// paywall when the trial should end. Provisioning lazily on the first
// authenticated read keeps every account consistent without a signup trigger.

const TRIAL_DAYS = 14;

export async function ensureOrganisationForUser(userId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: existing } = await supabaseAdmin
    .from("organisation_members")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return;

  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: org, error } = await supabaseAdmin
    .from("organisations")
    .insert({
      name: "My organisation",
      owner_id: userId,
      plan: "standard",
      trial_ends_at: trialEndsAt,
    })
    .select("id")
    .maybeSingle();
  if (error || !org?.id) return;

  await supabaseAdmin.from("organisation_members").insert({
    org_id: org.id,
    user_id: userId,
    role: "owner",
    accepted_at: new Date().toISOString(),
  });
}
