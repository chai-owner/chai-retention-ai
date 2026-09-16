// Best-effort per-user AI token usage logging + the authenticated Supabase
// client used to attribute AI activity to the caller. The bearer token
// (attached to every server-fn call for signed-in users) identifies the user.
// Unauthenticated demo calls are skipped.
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export interface AiUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface AiCaller {
  supabase: SupabaseClient<Database>;
  userId: string;
}

// Resolves the signed-in caller from the request's bearer token. Returns null
// for demo / unauthenticated calls so callers can degrade gracefully.
export async function resolveAiCaller(): Promise<AiCaller | null> {
  try {
    const authHeader = getRequestHeader("authorization");
    if (!authHeader?.startsWith("Bearer ")) return null;
    const token = authHeader.slice("Bearer ".length);
    if (!token) return null;

    const url = process.env.SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL;
    const key =
      process.env.SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return null;

    const supabase = createClient<Database>(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    const { data } = await supabase.auth.getClaims(token);
    const userId = data?.claims?.sub;
    if (!userId) return null;

    return { supabase, userId };
  } catch {
    return null;
  }
}

export interface AiUsageRecord {
  operation: string;
  model: string;
  provider?: string;
  usage?: AiUsage;
  success?: boolean;
  errorMessage?: string;
  caller?: AiCaller | null;
}

export async function logAiCall(record: AiUsageRecord): Promise<void> {
  try {
    const caller = record.caller ?? (await resolveAiCaller());
    if (!caller) return;

    const input = record.usage?.promptTokens ?? 0;
    const output = record.usage?.completionTokens ?? 0;
    const total = record.usage?.totalTokens ?? input + output;

    await caller.supabase.from("ai_usage_log").insert({
      user_id: caller.userId,
      operation: record.operation,
      model: record.model,
      provider: record.provider ?? "lovable",
      success: record.success ?? true,
      error_message: record.errorMessage ?? null,
      input_tokens: input,
      output_tokens: output,
      total_tokens: total,
    });
  } catch {
    // Logging must never break the AI response.
  }
}

// Back-compat helper kept so existing call sites keep working unchanged.
export async function logAiUsage(
  operation: string,
  model: string,
  usage: AiUsage | undefined,
): Promise<void> {
  await logAiCall({ operation, model, usage });
}
