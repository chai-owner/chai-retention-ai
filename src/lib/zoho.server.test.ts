// Zoho CRM multi-data-center OAuth: accounts-server validation, code exchange
// against the region Zoho returns, persisted data center, and refresh using it.
import { describe, it, expect, beforeEach } from "vitest";
import {
  ZOHO_ACCOUNTS_SERVERS,
  accountsHost,
  apiDomainForDc,
  dcFromLocation,
  validateAccountsServer,
  resolveCallbackDataCenter,
  exchangeZohoCode,
  refreshZohoToken,
  buildZohoAuthorizeUrl,
} from "@/lib/zoho.server";
import { mockFetch } from "@/test/http";

beforeEach(() => {
  process.env.ZOHO_CLIENT_ID = "zoho-client";
  process.env.ZOHO_CLIENT_SECRET = "zoho-secret";
  process.env.ZOHO_DATA_CENTER = "eu";
});

describe("accounts-server validation", () => {
  it("accepts every supported Zoho accounts domain", () => {
    for (const [dc, server] of Object.entries(ZOHO_ACCOUNTS_SERVERS)) {
      expect(validateAccountsServer(server)).toEqual({ dc, accountsServer: server });
    }
  });

  it("maps Zoho's US accounts server to the com data center", () => {
    expect(validateAccountsServer("https://accounts.zoho.com")).toEqual({
      dc: "com",
      accountsServer: "https://accounts.zoho.com",
    });
  });

  it("rejects unsupported and malicious hosts", () => {
    for (const bad of [
      "https://accounts.zoho.com.evil.io",
      "https://evil.example.com",
      "http://accounts.zoho.com",
      "https://user:pass@accounts.zoho.com",
      "not-a-url",
      "",
      null,
      undefined,
    ]) {
      expect(validateAccountsServer(bad as string | null)).toBeNull();
    }
  });

  it("maps Zoho location codes onto data centers", () => {
    expect(dcFromLocation("us")).toBe("com");
    expect(dcFromLocation("eu")).toBe("eu");
    expect(dcFromLocation("au")).toBe("com.au");
    expect(dcFromLocation("mars")).toBeNull();
  });
});

describe("callback data-center resolution", () => {
  it("uses the returned US accounts server even when configured for EU", () => {
    expect(
      resolveCallbackDataCenter({
        accountsServer: "https://accounts.zoho.com",
        location: "us",
        storedDc: "eu",
      }),
    ).toEqual({ dc: "com", accountsServer: "https://accounts.zoho.com" });
  });

  it("keeps EU connections on the EU accounts server", () => {
    expect(
      resolveCallbackDataCenter({
        accountsServer: "https://accounts.zoho.eu",
        location: "eu",
        storedDc: "eu",
      }),
    ).toEqual({ dc: "eu", accountsServer: "https://accounts.zoho.eu" });
  });

  it("falls back to location when accounts-server is malicious", () => {
    expect(
      resolveCallbackDataCenter({
        accountsServer: "https://accounts.zoho.com.attacker.test",
        location: "us",
        storedDc: "eu",
      }),
    ).toEqual({ dc: "com", accountsServer: "https://accounts.zoho.com" });
  });

  it("falls back to the state-bound data center when Zoho sends nothing usable", () => {
    expect(
      resolveCallbackDataCenter({ accountsServer: null, location: null, storedDc: "eu" }),
    ).toEqual({ dc: "eu", accountsServer: "https://accounts.zoho.eu" });
    expect(
      resolveCallbackDataCenter({
        accountsServer: "https://evil.test",
        location: "nowhere",
        storedDc: "in",
      }),
    ).toEqual({ dc: "in", accountsServer: "https://accounts.zoho.in" });
  });
});

describe("token exchange", () => {
  const TOKENS = {
    access_token: "at-1",
    refresh_token: "rt-1",
    api_domain: "https://www.zohoapis.com",
    expires_in: 3600,
  };

  it("redeems the code against the returned US accounts server", async () => {
    const http = mockFetch([{ match: "accounts.zoho.com/oauth/v2/token", json: TOKENS }]);
    const tokens = await exchangeZohoCode({
      accountsServer: "https://accounts.zoho.com",
      dc: "com",
      code: "code-1",
      redirectUri: "https://chai-retention-ai.lovable.app/api/public/zoho/callback",
    });
    expect(http.urls()[0]).toBe("https://accounts.zoho.com/oauth/v2/token");
    expect(tokens.accessToken).toBe("at-1");
    expect(tokens.apiDomain).toBe("https://www.zohoapis.com");
  });

  it("redeems the code against the EU accounts server", async () => {
    const http = mockFetch([
      { match: "accounts.zoho.eu/oauth/v2/token", json: { ...TOKENS, api_domain: "" } },
    ]);
    const tokens = await exchangeZohoCode({
      accountsServer: "https://accounts.zoho.eu",
      dc: "eu",
      code: "code-2",
      redirectUri: "https://chai-retention-ai.lovable.app/api/public/zoho/callback",
    });
    expect(http.urls()[0]).toBe("https://accounts.zoho.eu/oauth/v2/token");
    // api_domain is derived from the data center when Zoho omits it.
    expect(tokens.apiDomain).toBe(apiDomainForDc("eu"));
  });

  it("surfaces provider failures with status and body", async () => {
    mockFetch([
      { match: "accounts.zoho.com/oauth/v2/token", status: 400, json: { error: "invalid_code" } },
    ]);
    await expect(
      exchangeZohoCode({
        accountsServer: "https://accounts.zoho.com",
        dc: "com",
        code: "bad",
        redirectUri: "https://x.test/cb",
      }),
    ).rejects.toThrow(/400/);
  });

  it("refreshes against the persisted data center", async () => {
    const http = mockFetch([{ match: "accounts.zoho.com/oauth/v2/token", json: TOKENS }]);
    const tokens = await refreshZohoToken("https://accounts.zoho.com", "rt-1", "com");
    expect(http.urls()[0]).toBe("https://accounts.zoho.com/oauth/v2/token");
    expect(http.requests[0].body).toContain("grant_type=refresh_token");
    expect(tokens.apiDomain).toBe("https://www.zohoapis.com");
  });
});

describe("authorize URL", () => {
  it("carries state, offline access and the exact redirect URI", () => {
    const url = new URL(
      buildZohoAuthorizeUrl("com", "https://chai-retention-ai.lovable.app/api/public/zoho/callback", "state-1"),
    );
    expect(url.origin + url.pathname).toBe(`${accountsHost("com")}/oauth/v2/auth`);
    expect(url.searchParams.get("state")).toBe("state-1");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://chai-retention-ai.lovable.app/api/public/zoho/callback",
    );
  });
});
