// HubSpot Marketplace readiness: minimal scopes + required external uninstall.
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  HUBSPOT_SCOPES,
  HUBSPOT_EXTERNAL_UNINSTALL_PATH,
  hubspotExternalUninstall,
  disconnectHubspotForUser,
  redactSecrets,
} from "@/lib/hubspot.server";
import { encryptConnectionKey } from "@/lib/connection-key-crypto.server";
import { mockFetch } from "@/test/http";
import { setSupabaseResult, supabaseMock } from "@/test/setup";

const KEY = "lovack_secret_connection_key";
const UNINSTALL_URL =
  "https://connector-gateway.lovable.dev/hubspot/appinstalls/v3/external-install";

beforeEach(() => {
  process.env.LOVABLE_API_KEY = "test-lovable-key";
});

function connectedRow() {
  setSupabaseResult("app_user_connections", {
    data: { connection_key_ciphertext: encryptConnectionKey(KEY), metadata: {} },
  });
}

describe("HubSpot scopes", () => {
  it("requests only companies + deals read", () => {
    expect([...HUBSPOT_SCOPES]).toEqual([
      "crm.objects.companies.read",
      "crm.objects.deals.read",
    ]);
  });

  it("no longer requests the contacts scope anywhere", () => {
    expect([...HUBSPOT_SCOPES]).not.toContain("crm.objects.contacts.read");
  });
});

describe("hubspotExternalUninstall", () => {
  it("DELETEs the external-install endpoint through the gateway", async () => {
    const http = mockFetch([{ match: HUBSPOT_EXTERNAL_UNINSTALL_PATH, status: 200, json: { deleted: true } }]);
    const outcome = await hubspotExternalUninstall(KEY);

    expect(outcome).toEqual({ uninstalled: true, alreadyUninstalled: false });
    const req = http.find("external-install")!;
    expect(req.url).toBe(UNINSTALL_URL);
    expect(req.method).toBe("DELETE");
    // Credential travels only in the gateway header, never in URL or body.
    expect(req.headers["x-connection-api-key"]).toBe(KEY);
    expect(req.url).not.toContain("lovack_");
    expect(req.body ?? "").not.toContain("lovack_");
  });

  it("treats 404 as already uninstalled", async () => {
    mockFetch([{ match: "external-install", status: 404, json: { message: "not found" } }]);
    await expect(hubspotExternalUninstall(KEY)).resolves.toEqual({
      uninstalled: false,
      alreadyUninstalled: true,
    });
  });

  it("treats 410 as already uninstalled", async () => {
    mockFetch([{ match: "external-install", status: 410, json: { message: "gone" } }]);
    const outcome = await hubspotExternalUninstall(KEY);
    expect(outcome.alreadyUninstalled).toBe(true);
  });

  it("throws on a HubSpot API failure without leaking the key", async () => {
    mockFetch([
      {
        match: "external-install",
        status: 500,
        json: { message: `boom for ${KEY}`, access_token: "abc123" },
      },
    ]);
    await expect(hubspotExternalUninstall(KEY)).rejects.toThrow(/HubSpot uninstall failed \[500\]/);
    await expect(hubspotExternalUninstall(KEY)).rejects.not.toThrow(new RegExp(KEY));
  });

  it("redacts credential-shaped strings", () => {
    expect(redactSecrets(`k=${KEY}`)).not.toContain(KEY);
    expect(redactSecrets('"access_token":"abc.def-123"')).not.toContain("abc.def-123");
  });
});

describe("disconnectHubspotForUser", () => {
  it("uninstalls on HubSpot, then clears local state", async () => {
    connectedRow();
    const http = mockFetch([
      { match: "external-install", status: 200, json: { deleted: true } },
      { match: "/api/v1/app-users/connection", status: 200, json: {} },
    ]);

    const result = await disconnectHubspotForUser("user-1");

    expect(result).toEqual({ ok: true, uninstalled: true, alreadyUninstalled: false });
    // HubSpot uninstall happened before the gateway connection was released.
    expect(http.urls()[0]).toContain("external-install");
    // Local cleanup: connection row + CRM sync state.
    expect(supabaseMock.from).toHaveBeenCalledWith("app_user_connections");
    expect(supabaseMock.from).toHaveBeenCalledWith("crm_sync_state");
  });

  it("keeps the local connection when HubSpot rejects the uninstall", async () => {
    connectedRow();
    mockFetch([{ match: "external-install", status: 500, json: { message: "nope" } }]);
    const before = supabaseMock.from.mock.calls.length;

    await expect(disconnectHubspotForUser("user-1")).rejects.toThrow(/HubSpot uninstall failed/);

    // Only the read happened — no delete / sync-state clear.
    const tables = supabaseMock.from.mock.calls.slice(before).map((c) => c[0]);
    expect(tables).not.toContain("crm_sync_state");
  });

  it("still succeeds when the gateway disconnect fails after a good uninstall", async () => {
    connectedRow();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch([
      { match: "external-install", status: 200, json: { deleted: true } },
      { match: "/api/v1/app-users/connection", status: 500, json: { message: "gateway down" } },
    ]);

    await expect(disconnectHubspotForUser("user-1")).resolves.toMatchObject({ ok: true });
    expect(supabaseMock.from).toHaveBeenCalledWith("crm_sync_state");
  });

  it("is idempotent when no connection exists (repeated disconnect)", async () => {
    setSupabaseResult("app_user_connections", { data: null });
    const http = mockFetch([{ match: "external-install", status: 200, json: { deleted: true } }]);

    const first = await disconnectHubspotForUser("user-1");
    const second = await disconnectHubspotForUser("user-1");

    expect(first).toEqual({ ok: true, uninstalled: false, alreadyUninstalled: true });
    expect(second).toEqual(first);
    // No provider calls at all when there's nothing installed for this user.
    expect(http.requests).toHaveLength(0);
  });
});
