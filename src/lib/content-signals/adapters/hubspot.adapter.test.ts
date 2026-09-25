import { describe, it, expect } from "vitest";
import {
  activityText,
  fetchHubspotConversations,
  type HubspotAdapterDeps,
} from "./hubspot.adapter.server";
import { isUsableConversation } from "../source-adapter";
import { missingHubspotScopes } from "@/lib/hubspot-api";

const recent = "2026-09-20T10:00:00.000Z";

function deps(pages: Record<string, unknown>, assoc: Record<string, string> = {}) {
  const calls: string[] = [];
  const d: HubspotAdapterDeps = {
    async get(path) {
      calls.push(path);
      const m = path.match(/\/crm\/objects\/[^/]+\/(\w+)\/([^/]+)\/associations\/companies/);
      if (m) {
        const cid = assoc[`${m[1]}:${decodeURIComponent(m[2])}`];
        return { results: cid ? [{ toObjectId: cid }] : [] };
      }
      const type = path.match(/\/crm\/objects\/[^/]+\/(\w+)\?/)?.[1] ?? "";
      return pages[type] ?? { results: [] };
    },
  };
  return { d, calls };
}

describe("HubSpot content adapter", () => {
  it("labels incoming email as the customer's words and strips HTML", () => {
    const r = activityText("emails", {
      id: "1",
      properties: {
        hs_email_subject: "Renewal",
        hs_email_html: "<p>We are looking at <b>Gainsight</b>.</p>",
        hs_email_direction: "INCOMING_EMAIL",
      },
    });
    expect(r.subject).toBe("Renewal");
    expect(r.body).toBe("Customer (email): We are looking at Gainsight.");
  });

  it("traces company directly, via deal, via contact, and drops untraceable", async () => {
    const mk = (id: string, assoc: Record<string, string[]>) => ({
      id,
      properties: { hs_note_body: `note ${id} with enough words to matter`, hs_timestamp: recent, hs_lastmodifieddate: recent },
      associations: Object.fromEntries(
        Object.entries(assoc).map(([k, ids]) => [k, { results: ids.map((i) => ({ id: i })) }]),
      ),
    });
    const { d } = deps(
      {
        notes: {
          results: [
            mk("a", { companies: ["C1"] }),
            mk("b", { deals: ["D1"] }),
            mk("c", { contacts: ["P1"] }),
            mk("d", { contacts: ["P9"] }),
          ],
        },
      },
      { "deals:D1": "C2", "contacts:P1": "C3" },
    );
    const out = await fetchHubspotConversations({ userId: "u", since: null, limit: 50 }, d);
    expect(out.map((c) => [c.externalId, c.customerRef])).toEqual([
      ["notes-a", "C1"],
      ["notes-b", "C2"],
      ["notes-c", "C3"],
    ]);
    expect(out.every(isUsableConversation)).toBe(true);
  });

  it("pages every activity type, only via GET list paths (never search)", async () => {
    const { d, calls } = deps({
      calls: {
        results: [{ id: "1", properties: { hs_call_body: "x y z", hs_timestamp: recent }, associations: { companies: { results: [{ id: "C" }] } } }],
        paging: { next: { after: "p2" } },
      },
    });
    await fetchHubspotConversations({ userId: "u", since: null, limit: 50 }, d);
    for (const t of ["notes", "calls", "meetings", "tasks", "emails"]) {
      expect(calls.some((c) => c.includes(`/crm/objects/2026-09/${t}?`))).toBe(true);
    }
    expect(calls.some((c) => c.includes("after=p2"))).toBe(true);
    expect(calls.some((c) => /search|batch/.test(c))).toBe(false);
  });

  it("skips activities older than the cursor", async () => {
    const { d } = deps({
      notes: {
        results: [
          { id: "old", properties: { hs_note_body: "old", hs_lastmodifieddate: "2026-01-01T00:00:00Z" }, associations: { companies: { results: [{ id: "C" }] } } },
          { id: "new", properties: { hs_note_body: "new", hs_lastmodifieddate: recent }, associations: { companies: { results: [{ id: "C" }] } } },
        ],
      },
    });
    const out = await fetchHubspotConversations({ userId: "u", since: "2026-09-01T00:00:00Z", limit: 50 }, d);
    expect(out.map((c) => c.externalId)).toEqual(["notes-new"]);
  });

  it("flags connections made before activity access for reconnect", () => {
    expect(missingHubspotScopes(undefined)).toContain("crm.objects.contacts.read");
    expect(
      missingHubspotScopes(["crm.objects.companies.read", "crm.objects.deals.read", "crm.objects.contacts.read"]),
    ).toEqual([]);
  });
});
