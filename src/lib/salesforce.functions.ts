// Server functions for the per-user Salesforce App User Connector flow:
// start OAuth, save the connection key, check status, and disconnect.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
const CONNECTOR_ID = "salesforce";

export const startSalesforceConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ targetOrigin: z.string().url() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const clientAPIKey = process.env.SALESFORCE_APP_USER_CONNECTOR_CLIENT_API_KEY;
    if (!clientAPIKey) {
      throw new Error(
        "Salesforce App User Connector client isn't configured. A workspace admin needs to add it.",
      );
    }
    const { authorizeAppUserOAuth } = await import(
      "@/integrations/lovable/appUserConnector"
    );
    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectorId: CONNECTOR_ID,
      appUserId: context.userId,
      clientAPIKey,
      returnUrl: data.targetOrigin,
      responseMode: "web_message",
      webMessageTargetOrigin: data.targetOrigin,
    });
    return { authorizationUrl };
  });

export const saveSalesforceConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ connectionAPIKey: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { saveConnectionKeyForUser } = await import("./app-user-connections.server");
    const { callAsAppUser } = await import("@/integrations/lovable/appUserConnector");
    const { ensureCrmSyncState } = await import("./crm.server");

    // Identity check is REQUIRED: if we can't reach Salesforce as this user we
    // must not persist the key, otherwise the UI would claim "Connected" for a
    // connection that can never sync.
    let orgName: string | null = null;
    try {
      const res = await callAsAppUser({
        gatewayBaseUrl: GATEWAY_BASE_URL,
        connectionAPIKey: data.connectionAPIKey,
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

    await saveConnectionKeyForUser(context.userId, CONNECTOR_ID, data.connectionAPIKey, {
      org_name: orgName,
    });
    await ensureCrmSyncState(context.userId, "salesforce");
    return { ok: true, orgName };
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
