import { syncZohoForUser } from "@/lib/zoho.server";
const sets = await syncZohoForUser("5debf9d7-bcd9-4485-b9b8-27c247cba6bb", 500, null);
const tx = sets.find((s) => s.key === "transactions");
const h = tx?.headers ?? [];
const rows = (tx?.rows ?? []).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]])));
console.log(JSON.stringify(rows.map((r) => ({ id: r.transaction_id, name: r.product, stage: r.deal_stage, status: r.deal_status, amount: r.amount, date: r.transaction_date })), null, 1));
await Bun.write("/tmp/zoho_status.json", JSON.stringify(Object.fromEntries(rows.map((r) => [r.transaction_id, { deal_status: r.deal_status, deal_stage: r.deal_stage }]))));
