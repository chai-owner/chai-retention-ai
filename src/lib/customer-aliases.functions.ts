// Server functions for the customer-link wizard: persisted mappings from a raw
// `customer_id` found in uploaded/synced rows to the real customer it belongs
// to (or an "ignored" marker so it stops being flagged).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const AliasInput = z.object({
  source_id: z.string().min(1).max(200),
  customer_id: z.string().max(200).nullable(),
  status: z.enum(["linked", "ignored"]),
});

export const listCustomerAliases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("customer_id_aliases")
      .select("source_id, customer_id, status")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return (data ?? []) as { source_id: string; customer_id: string | null; status: string }[];
  });

export const saveCustomerAlias = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => AliasInput.parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("customer_id_aliases").upsert(
      {
        user_id: context.userId,
        source_id: data.source_id,
        customer_id: data.status === "ignored" ? null : data.customer_id,
        status: data.status,
      },
      { onConflict: "user_id,source_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCustomerAlias = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ source_id: z.string().min(1) }).parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("customer_id_aliases")
      .delete()
      .eq("user_id", context.userId)
      .eq("source_id", data.source_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
