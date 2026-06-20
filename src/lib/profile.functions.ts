// Server functions for reading and writing the signed-in user's onboarding
// profile. RLS scopes every query to the current user via requireSupabaseAuth.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const segmentSchema = z.object({
  name: z.string(),
  min: z.string(),
  max: z.string(),
});

const profileInput = z.object({
  company: z.string(),
  industry: z.string(),
  model: z.string(),
  segments: z.array(segmentSchema),
  successActions: z.string(),
  disengagement: z.string(),
  tracked: z.record(z.string(), z.boolean()),
  channels: z.array(z.string()),
});

export const getProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "company, industry, model, segments, success_actions, disengagement, tracked, channels, onboarded",
      )
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      company: data.company,
      industry: data.industry,
      model: data.model,
      segments: data.segments,
      successActions: data.success_actions,
      disengagement: data.disengagement,
      tracked: data.tracked,
      channels: data.channels,
      onboarded: data.onboarded,
    };
  });

export const saveProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => profileInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("profiles").upsert({
      id: userId,
      company: data.company,
      industry: data.industry,
      model: data.model,
      segments: data.segments,
      success_actions: data.successActions,
      disengagement: data.disengagement,
      tracked: data.tracked,
      channels: data.channels,
      onboarded: true,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return { ok: true };
  });
