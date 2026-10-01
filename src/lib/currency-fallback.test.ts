import { describe, expect, it } from "vitest";
import { syncedCurrency, zohoOrgCurrency, applyAccountCurrency } from "./currency-rules";
import { mapHubspotCompany, mapHubspotDeal } from "./crm.server";
import { buildZohoDatasets } from "./zoho.server";

describe("1. organisation base currency fallback", () => {
  it("uses the row's own currency first", () => {
    expect(syncedCurrency("zar", "USD")).toEqual(["ZAR", "1"]);
  });
  it("falls back to the org base currency, marked as provider-confirmed", () => {
    expect(syncedCurrency("", "ZAR")).toEqual(["ZAR", "1"]);
    expect(syncedCurrency(undefined, "usd")).toEqual(["USD", "1"]);
  });
  it("stays unknown only when there is nothing to go on", () => {
    expect(syncedCurrency("", "")).toEqual(["", ""]);
    expect(syncedCurrency(null, undefined)).toEqual(["", ""]);
    expect(syncedCurrency("", "not-a-code")).toEqual(["", ""]);
  });
  it("HubSpot deals with no currency take the portal default", () => {
    const deal = { id: "d1", properties: { amount: "100", dealname: "X", hs_is_closed_won: "true" } };
    const row = mapHubspotDeal(deal, "ZAR");
    expect(row[5]).toBe("ZAR");
    expect(row[8]).toBe("1");
    const own = mapHubspotDeal({ id: "d2", properties: { amount: "1", deal_currency_code: "eur" } }, "ZAR");
    expect(own[5]).toBe("EUR");
    expect(mapHubspotDeal(deal, "")[5]).toBe("");
  });
});

describe("2. Zoho deal and home currency", () => {
  const empty = { accounts: [], contacts: [], activities: [] };
  it("reads the org home currency", () => {
    expect(zohoOrgCurrency({ iso_code: "ZAR" })).toBe("ZAR");
    expect(zohoOrgCurrency({ currency: "US Dollar - USD" })).toBe("USD");
    expect(zohoOrgCurrency(null)).toBe("");
  });
  it("uses the deal's Currency, else the home currency", () => {
    const ds = buildZohoDatasets({
      ...empty,
      homeCurrency: "ZAR",
      deals: [
        { id: "1", Account_Name: { id: "a" }, Amount: 10, Stage: "Closed Won", Currency: "USD" },
        { id: "2", Account_Name: { id: "a" }, Amount: 20, Stage: "Closed Won" },
      ],
    });
    const tx = ds.find((d) => d.key === "transactions")!;
    const ci = tx.headers.indexOf("currency");
    const vi = tx.headers.indexOf("currency_verified");
    expect(tx.rows[0]![ci]).toBe("USD");
    expect(tx.rows[1]![ci]).toBe("ZAR");
    expect(tx.rows[1]![vi]).toBe("1");
  });
  it("leaves Zoho deals blank only when no home currency is known", () => {
    const ds = buildZohoDatasets({ ...empty, deals: [{ id: "1", Account_Name: { id: "a" }, Amount: 5, Stage: "Closed Won" }] });
    const tx = ds.find((d) => d.key === "transactions")!;
    expect(tx.rows[0]![tx.headers.indexOf("currency")]).toBe("");
  });
});

describe("3. customer monthly revenue currency", () => {
  it("tags synced CRM customer revenue with the source currency", () => {
    const row = mapHubspotCompany({ id: "c1", properties: { name: "A", annualrevenue: "120000" } }, "ZAR");
    expect(row[4]).toBe("10000");
    expect(row.slice(7)).toEqual(["ZAR", "1"]);
    // No revenue → no currency tag needed.
    expect(mapHubspotCompany({ id: "c2", properties: { name: "B" } }, "ZAR").slice(7)).toEqual(["", ""]);
  });
  it("Zoho account revenue carries the home currency", () => {
    const ds = buildZohoDatasets({
      accounts: [{ id: "a", Account_Name: "A", Annual_Revenue: 1200 }],
      deals: [], contacts: [], activities: [], homeCurrency: "ZAR",
    });
    const c = ds.find((d) => d.key === "customers")!;
    expect(c.rows[0]![c.headers.indexOf("currency")]).toBe("ZAR");
  });
  it("foreign-currency customer revenue is left out; untagged uploads follow the account", () => {
    const data: { customers: Array<Record<string, string>> } = {
      customers: [
        { customer_id: "synced", monthly_revenue: "1000", currency: "ZAR", currency_verified: "1", __source: "hubspot" },
        { customer_id: "upload", monthly_revenue: "500" },
        { customer_id: "home", monthly_revenue: "700", currency: "USD", currency_verified: "1", __source: "hubspot" },
      ],
    };
    const { data: out, exclusion } = applyAccountCurrency(data, "USD");
    expect(out.customers[0]!.monthly_revenue).toBe("");
    expect(out.customers[1]!.monthly_revenue).toBe("500");
    expect(out.customers[2]!.monthly_revenue).toBe("700");
    expect(exclusion.excludedRows).toBe(1);
  });
});
