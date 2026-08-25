// Server functions for the per-user HubSpot App User Connector flow:
// start OAuth, save the connection key, check status, and disconnect.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Kept in sync with `hubspot.server.ts` (which owns the canonical list); this
// file stays client-safe, so it can't import the server-only module here.
const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
const CONNECTOR_ID = "hubspot";

// Minimal scopes: ChAi reads companies and deals only.
const HUBSPOT_SCOPE_LIST: string[] = [
  "crm.objects.companies.read",
  "crm.objects.deals.read",
];



export const startHubspotConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ targetOrigin: z.string().url() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const clientAPIKey = process.env.HUBSPOT_APP_USER_CONNECTOR_CLIENT_API_KEY;
    if (!clientAPIKey) {
      throw new Error(
        "HubSpot App User Connector client isn't configured. A workspace admin needs to add it.",
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
      credentialsConfiguration: { scopes: HUBSPOT_SCOPE_LIST },
    });
    return { authorizationUrl };
  });

export const saveHubspotConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ connectionAPIKey: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { saveConnectionKeyForUser } = await import("./app-user-connections.server");
    const { callAsAppUser } = await import("@/integrations/lovable/appUserConnector");
    const { ensureCrmSyncState } = await import("./crm.server");

    // Required validation: never persist a key we can't authenticate with.
    let portalName: string | null = null;
    try {
      const res = await callAsAppUser({
        gatewayBaseUrl: GATEWAY_BASE_URL,
        connectionAPIKey: data.connectionAPIKey,
        connectorId: CONNECTOR_ID,
        path: "/account-info/v3/details",
      });
      if (!res.ok) {
        const body = await res.text();
        console.error(`HubSpot connect validation failed [${res.status}]: ${body.slice(0, 300)}`);
        throw new Error(
          `HubSpot rejected the connection [${res.status}]. Make sure the app was installed with CRM read scopes, then connect again.`,
        );
      }
      const body = (await res.json()) as {
        portalId?: number;
        companyName?: string;
        uiDomain?: string;
      };
      portalName = body.companyName ?? (body.portalId ? `Portal ${body.portalId}` : null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("HubSpot connect validation error:", message);
      throw new Error(
        message.startsWith("HubSpot rejected")
          ? message
          : `Couldn't verify your HubSpot connection: ${message}. Nothing was saved — please try again.`,
      );
    }

    await saveConnectionKeyForUser(context.userId, CONNECTOR_ID, data.connectionAPIKey, {
      portal_name: portalName,
    });
    await ensureCrmSyncState(context.userId, "hubspot");
    return { ok: true, portalName };
  });


export const getHubspotStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionMetaForUser } = await import("./app-user-connections.server");
    const meta = await getConnectionMetaForUser(context.userId, CONNECTOR_ID);
    if (!meta) return { connected: false as const };
    return {
      connected: true as const,
      portalName: (meta.metadata.portal_name as string | null) ?? null,
      connectedAt: meta.connectedAt,
    };
  });

export const disconnectHubspot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Runs HubSpot's required external uninstall first, then clears local
    // state. See `hubspot.server.ts` for the ordering guarantees.
    const { disconnectHubspotForUser } = await import("./hubspot.server");
    return disconnectHubspotForUser(context.userId);
  });
