// Server functions for the per-user Salesforce App User Connector flow:
// start OAuth, save the connection key, check status, and disconnect.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
const CONNECTOR_ID = "salesforce";

export const DEFAULT_SALESFORCE_INSTANCE_URL = "https://login.salesforce.com";

/** Normalises a user-entered Salesforce instance/login URL to an https origin. */
export function normaliseInstanceUrl(raw: string | undefined | null): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return DEFAULT_SALESFORCE_INSTANCE_URL;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withScheme);
  return `https://${url.hostname}`;
}

export const startSalesforceConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        targetOrigin: z.string().url(),
        instanceUrl: z.string().trim().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const clientAPIKey = process.env.SALESFORCE_APP_USER_CONNECTOR_CLIENT_API_KEY;
    if (!clientAPIKey) {
      throw new Error(
        "Salesforce App User Connector client isn't configured. A workspace admin needs to add it.",
      );
    }
    let accountUrl: string;
    try {
      accountUrl = normaliseInstanceUrl(data.instanceUrl);
    } catch {
      throw new Error(
        "That Salesforce instance URL doesn't look right. Example: https://yourorg.my.salesforce.com",
      );
    }
    const { authorizeAppUserOAuth } = await import(
      "@/integrations/lovable/appUserConnector"
    );
    const { getConnectionKeyForUser } = await import("./app-user-connections.server");
    // Reconnect: pass the stored lovack_* so the gateway can confirm ownership.
    // First connect: null — omit the header.
    const connectionAPIKey = await getConnectionKeyForUser(context.userId, CONNECTOR_ID);
    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectorId: CONNECTOR_ID,
      appUserId: context.userId,
      clientAPIKey,
      returnUrl: new URL("/oauth/salesforce/return", data.targetOrigin).toString(),
      connectionAPIKey: connectionAPIKey ?? undefined,
      credentialsConfiguration: { account_url: accountUrl },
    });
    return { authorizationUrl, instanceUrl: accountUrl };
  });


export const saveSalesforceConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ code: z.string().min(1), instanceUrl: z.string().trim().optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { saveConnectionKeyForUser } = await import("./app-user-connections.server");
    const { callAsAppUser, exchangeAppUserOAuthCode } = await import(
      "@/integrations/lovable/appUserConnector"
    );
    const { ensureCrmSyncState } = await import("./crm.server");

    // Exchange the one-time redirect code for the per-user connection key.
    // The key never touches the browser.
    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(
      GATEWAY_BASE_URL,
      data.code,
    );
    if (connectorId !== CONNECTOR_ID) {
      throw new Error("OAuth completion returned the wrong connector");
    }

    // Identity check is REQUIRED: if we can't reach Salesforce as this user we
    // must not persist the key, otherwise the UI would claim "Connected" for a
    // connection that can never sync.
    let orgName: string | null = null;
    try {
      const res = await callAsAppUser({
        gatewayBaseUrl: GATEWAY_BASE_URL,
        connectionAPIKey,
        connectorId: CONNECTOR_ID,
        path: "/query?q=" + encodeURIComponent("SELECT Name FROM Organization LIMIT 1"),
      });
      if (!res.ok) {
        const body = await res.text();
        console.error(`Salesforce connect validation failed [${res.status}]: ${body.slice(0, 300)}`);
        throw new Error(
          `Salesforce rejected the connection [${res.status}]. Check that the connected app has API access (scope "api") and try connecting again.`,
        );
      }
      const body = (await res.json()) as { records?: { Name?: string }[] };
      orgName = body.records?.[0]?.Name ?? null;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Salesforce connect validation error:", message);
      throw new Error(
        message.startsWith("Salesforce rejected")
          ? message
          : `Couldn't verify your Salesforce connection: ${message}. Nothing was saved — please try again.`,
      );
    }

    const instanceUrl = normaliseInstanceUrl(data.instanceUrl);
    await saveConnectionKeyForUser(context.userId, CONNECTOR_ID, connectionAPIKey, {
      org_name: orgName,
      instance_url: instanceUrl,
    });
    await ensureCrmSyncState(context.userId, "salesforce");
    return { ok: true, orgName, instanceUrl };
  });


export const getSalesforceStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionMetaForUser } = await import("./app-user-connections.server");
    const meta = await getConnectionMetaForUser(context.userId, CONNECTOR_ID);
    if (!meta) return { connected: false as const };
    return {
      connected: true as const,
      orgName: (meta.metadata.org_name as string | null) ?? null,
      connectedAt: meta.connectedAt,
    };
  });

export const disconnectSalesforce = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionKeyForUser, deleteConnectionForUser } = await import(
      "./app-user-connections.server"
    );
    const key = await getConnectionKeyForUser(context.userId, CONNECTOR_ID);
    if (key) {
      try {
        const { disconnectAppUser } = await import(
          "@/integrations/lovable/appUserConnector"
        );
        await disconnectAppUser({
          gatewayBaseUrl: GATEWAY_BASE_URL,
          connectionAPIKey: key,
          connectorId: CONNECTOR_ID,
        });
      } catch (err) {
        // Still delete the local row so the UI resets.
        console.error(
          "Salesforce gateway disconnect failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }
    await deleteConnectionForUser(context.userId, CONNECTOR_ID);
    const { clearCrmSyncState } = await import("./crm.server");
    await clearCrmSyncState(context.userId, "salesforce");

    return { ok: true };
  });
