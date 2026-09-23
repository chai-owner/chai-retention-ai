import { describe, it, expect } from "vitest";
import { findSupportAutoLinks, businessDomain, companyKey } from "./support-company-matching";
import type { IngestedData } from "./ingested-data-store";

const cust = (id: string, name: string, email = "", extra: Record<string, string> = {}) => ({
  customer_id: id, name, email, __source: "hubspot", ...extra,
});
const ticket = (id: string, requester: string, email: string, company = "", source = "zendesk") => ({
  ticket_id: id, customer_id: requester, email, company, __source: source,
});

describe("findSupportAutoLinks", () => {
  const customers = [
    cust("c1", "Northstar Legal", "@northstarlegal.com"),
    cust("c2", "Willow Creek Hotels", "", { website: "https://www.willowcreek.com/about" }),
    cust("c3", "Shared A", "@shared.com"),
    cust("c4", "Shared B", "@shared.com"),
    cust("c5", "Acme Corp"),
  ];

  it("links by business email domain when exactly one company has it", () => {
    const data: IngestedData = { customers, support: [ticket("1", "z1", "ann@northstarlegal.com")] };
    const links = findSupportAutoLinks(data, []);
    expect(links).toEqual([
      expect.objectContaining({ source: "zendesk", source_id: "z1", customer_id: "c1", method: "auto_domain" }),
    ]);
  });

  it("reads the domain from a website field too", () => {
    const data: IngestedData = { customers, support: [ticket("1", "z2", "bob@willowcreek.com")] };
    expect(findSupportAutoLinks(data, [])[0]?.customer_id).toBe("c2");
  });

  it("never links personal mailboxes by domain", () => {
    const data: IngestedData = { customers: [...customers, cust("c9", "Gmail Fans", "@gmail.com")], support: [ticket("1", "z3", "x@gmail.com")] };
    expect(findSupportAutoLinks(data, [])).toEqual([]);
  });

  it("does not guess when two companies share a domain, even if the org name would match", () => {
    const data: IngestedData = { customers, support: [ticket("1", "z4", "x@shared.com", "Shared A")] };
    expect(findSupportAutoLinks(data, [])).toEqual([]);
  });

  it("falls back to the support organisation name", () => {
    const data: IngestedData = { customers, support: [ticket("1", "z5", "x@gmail.com", "ACME, Inc.")] };
    expect(findSupportAutoLinks(data, [])).toEqual([
      expect.objectContaining({ source_id: "z5", customer_id: "c5", method: "auto_organisation" }),
    ]);
  });

  it("never touches a requester with any saved alias (manual link or not-a-match)", () => {
    const data: IngestedData = { customers, support: [ticket("1", "z1", "a@northstarlegal.com"), ticket("2", "z6", "b@northstarlegal.com")] };
    const links = findSupportAutoLinks(data, [
      { source: "zendesk", source_id: "z1", customer_id: "c2", status: "linked" },
      { source: "zendesk", source_id: "z6", customer_id: null, status: "ignored" },
    ]);
    expect(links).toEqual([]);
  });

  it("leaves a requester alone when their tickets point at different companies", () => {
    const data: IngestedData = { customers, support: [ticket("1", "z7", "a@northstarlegal.com"), ticket("2", "z7", "a@willowcreek.com")] };
    expect(findSupportAutoLinks(data, [])).toEqual([]);
  });

  it("ignores requesters who are already customers and non-support rows", () => {
    const data: IngestedData = { customers, support: [ticket("1", "c1", "a@northstarlegal.com"), ticket("2", "q1", "a@northstarlegal.com", "", "csv")] };
    expect(findSupportAutoLinks(data, [])).toEqual([]);
  });

  it("leaves unmatched requesters unmatched", () => {
    const data: IngestedData = { customers, support: [ticket("1", "z8", "someone@unknown.io", "Nobody Ltd")] };
    expect(findSupportAutoLinks(data, [])).toEqual([]);
  });
});

describe("helpers", () => {
  it("businessDomain / companyKey", () => {
    expect(businessDomain("A@Foo.COM")).toBe("foo.com");
    expect(businessDomain("a@proton.me")).toBe("");
    expect(companyKey("Northstar Legal, LLC")).toBe(companyKey("northstar legal"));
  });
});
