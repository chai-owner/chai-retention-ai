// Server functions for reading and writing the signed-in user's onboarding
// profile. RLS scopes every query to the current user via requireSupabaseAuth.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ProfileSegment } from "@/lib/profile-store";

const segmentSchema = z.object({
  name: z.string(),
  min: z.string(),
  max: z.string(),
});

const profileInput = z.object({
  company: z.string(),
  industry: z.string(),
  model: z.string(),
  size: z.string().optional(),
  customers: z.string().optional(),
  avgValue: z.string().optional(),
  whatBuy: z.string().optional(),
  cadence: z.string().optional(),
  lifespan: z.string().optional(),
  concerns: z.string().optional(),
  segments: z.array(segmentSchema),
  successActions: z.string(),
  disengagement: z.string(),
  tracked: z.record(z.string(), z.boolean()),
  channels: z.array(z.string()),
  metricWeights: z.record(z.string(), z.number()).optional(),
});

export const getProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "company, industry, model, size, customers, avg_value, what_buy, cadence, lifespan, concerns, segments, success_actions, disengagement, tracked, channels, metric_weights, onboarded",
      )
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      company: data.company,
      industry: data.industry,
      model: data.model,
      size: data.size ?? "",
      customers: data.customers ?? "",
      avgValue: data.avg_value ?? "",
      whatBuy: data.what_buy ?? "",
      cadence: data.cadence ?? "",
      lifespan: data.lifespan ?? "",
      concerns: data.concerns ?? "",
      segments: (data.segments ?? []) as unknown as ProfileSegment[],
      successActions: data.success_actions,
      disengagement: data.disengagement,
      tracked: (data.tracked ?? {}) as unknown as Record<string, boolean>,
      channels: (data.channels ?? []) as unknown as string[],
      metricWeights: (data.metric_weights ?? {}) as unknown as Record<string, number>,
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
      size: data.size ?? "",
      customers: data.customers ?? "",
      avg_value: data.avgValue ?? "",
      what_buy: data.whatBuy ?? "",
      cadence: data.cadence ?? "",
      lifespan: data.lifespan ?? "",
      concerns: data.concerns ?? "",
      segments: data.segments,
      success_actions: data.successActions,
      disengagement: data.disengagement,
      tracked: data.tracked,
      channels: data.channels,
      metric_weights: data.metricWeights ?? {},
      onboarded: true,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return { ok: true };
  });
