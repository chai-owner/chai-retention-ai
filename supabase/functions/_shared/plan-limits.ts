// Ported verbatim from src/lib/plan-limits.server.ts.
import {
  coercePlan,
  customerLimitMessage,
  customersAllowed,
  type OrgPlan,
} from "./organisations.ts";

// deno-lint-ignore no-explicit-any
type AnyClient = { from: (table: string) => any };

export class CustomerLimitError extends Error {
  readonly code = "customer_limit_reached";
  constructor(
    message: string,
    readonly plan: OrgPlan,
    readonly current: number,
    readonly incoming: number,
  ) {
    super(message);
    this.name = "CustomerLimitError";
  }
}

export async function loadPlanForUser(client: AnyClient, userId: string): Promise<OrgPlan> {
  const { data } = await client
    .from("organisation_members")
    // deno-lint-ignore no-explicit-any
    .select("organisations(plan)")
    .eq("user_id", userId)
    .maybeSingle();
  // deno-lint-ignore no-explicit-any
  return coercePlan((data as any)?.organisations?.plan);
}

export async function countCustomers(client: AnyClient, userId: string): Promise<number> {
  const { count } = await client
    .from("ingested_customers")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  return count ?? 0;
}

export async function assertCustomerCapacity(
  client: AnyClient,
  userId: string,
  incomingKeys: string[],
): Promise<void> {
  const plan = await loadPlanForUser(client, userId);
  const allowed = customersAllowed(plan);
  if (allowed === null) return;

  const unique = Array.from(new Set(incomingKeys.filter(Boolean)));
  if (unique.length === 0) return;

  const current = await countCustomers(client, userId);
  if (current + unique.length <= allowed) return;

  const existing = new Set<string>();
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200);
    const { data } = await client
      .from("ingested_customers")
      .select("customer_id")
      .eq("user_id", userId)
      .in("customer_id", chunk);
    for (const row of (data ?? []) as Array<{ customer_id: string }>) {
      existing.add(row.customer_id);
    }
  }
  const added = unique.filter((k) => !existing.has(k)).length;
  if (current + added <= allowed) return;

  throw new CustomerLimitError(customerLimitMessage(plan, current, added), plan, current, added);
}
