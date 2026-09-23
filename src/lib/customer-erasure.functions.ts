// Right-to-be-forgotten erasure for a single customer.
//
// Deletes every stored row that describes the person (customer record,
// transactions, support tickets, activity/usage, survey responses, and any
// saved identity mappings), then pseudonymises their scoring history so
// aggregate trends and counts stay intact — "delete the person, keep the
// insight".
//
// The work itself lives in customer-erasure.server.ts so it can be exercised
// directly against a database; this file is the authenticated entry point.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ForgetCustomerResult } from "@/lib/customer-erasure.server";

export type { ForgetCustomerResult };

const ForgetInput = z.object({
  identifier: z.string().trim().min(1).max(320),
});

export const forgetCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => ForgetInput.parse(v))
  .handler(async ({ data, context }): Promise<ForgetCustomerResult> => {
    const { eraseCustomerData } = await import("@/lib/customer-erasure.server");
    return eraseCustomerData(context.supabase, context.userId, data.identifier);
  });
