// Server functions for content risk signals: run a pass, read a customer's
// flags, dismiss a wrong one.
//
// Phase 3: active signals now feed the health score with a modest, decaying
// weight (see scoring.ts). Dismissing one removes its contribution from the
// stored score immediately, not just from the card. Every source is still only
// provisionally validated (constructed/hand-written test conversations).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface CustomerContentSignal {
  id: string;
  signal: string;
  quote: string;
  confidence: number;
  source: string;
  occurredAt: string | null;
  detectedAt: string;
  dismissedAt: string | null;
}

const CustomerInput = z.object({
  customerRefs: z.array(z.string().trim().min(1)).min(1).max(50),
});

export const getCustomerContentSignals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => CustomerInput.parse(v))
  .handler(async ({ data, context }): Promise<CustomerContentSignal[]> => {
    const { data: rows, error } = await context.supabase
      .from("content_risk_signals")
      .select("id, signal, quote, confidence, source, occurred_at, detected_at, dismissed_at")
      .eq("user_id", context.userId)
      .in("customer_ref", data.customerRefs)
      .is("dismissed_at", null)
      .order("occurred_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      id: r.id as string,
      signal: r.signal as string,
      quote: (r.quote as string) ?? "",
      confidence: Number(r.confidence ?? 0),
      source: r.source as string,
      occurredAt: (r.occurred_at as string | null) ?? null,
      detectedAt: r.detected_at as string,
      dismissedAt: (r.dismissed_at as string | null) ?? null,
    }));
  });

export const dismissContentSignal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<{ dismissed: boolean; rescored: number }> => {
    const { data: updated, error } = await context.supabase
      .from("content_risk_signals")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    // Ownership verified above (RLS + user filter). Nothing updated → nothing to rescore.
    if (!updated || updated.length === 0) return { dismissed: false, rescored: 0 };
    const { rescoreAfterDismissal } = await import("./dismissal.server");
    const rescored = await rescoreAfterDismissal(context.userId, data.id);
    return { dismissed: true, rescored };
  });

/** Manual "read my conversations now" for the connected account. */
export const runContentSignalScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { runContentExtractionForUser } = await import("./pipeline.server");
    return runContentExtractionForUser(context.userId);
  });
