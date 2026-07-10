// Best-effort per-user AI token usage logging. Called from AI server functions.
// The bearer token (attached to every server-fn call for signed-in users) is
// used to attribute usage to the caller. Unauthenticated demo calls are skipped.
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export interface AiUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export async function logAiUsage(
  operation: string,
  model: string,
  usage: AiUsage | undefined,
): Promise<void> {
  try {
    const authHeader = getRequestHeader("authorization");
    if (!authHeader?.startsWith("Bearer ")) return; // demo / unauthenticated — skip
    const token = authHeader.slice("Bearer ".length);
    if (!token) return;

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return;

    const supabase = createClient<Database>(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    const { data } = await supabase.auth.getClaims(token);
    const userId = data?.claims?.sub;
    if (!userId) return;

    const input = usage?.promptTokens ?? 0;
    const output = usage?.completionTokens ?? 0;
    const total = usage?.totalTokens ?? input + output;

    await supabase.from("ai_usage_log").insert({
      user_id: userId,
      operation,
      model,
      input_tokens: input,
      output_tokens: output,
      total_tokens: total,
    });
  } catch {
    // Logging must never break the AI response.
  }
}
