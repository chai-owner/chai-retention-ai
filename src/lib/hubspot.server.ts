// Server-only HubSpot lifecycle helpers.
//
// Scopes and the Marketplace-required external uninstall live here so both the
// connect flow and the disconnect flow share one definition. Every provider
// call goes through the Lovable connector gateway with the user's encrypted
// per-user connection key — no OAuth access/refresh token ever leaves the
// gateway, and nothing here returns a credential to the caller.
import type { CrmProvider } from "./crm.server";

export const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
export const CONNECTOR_ID = "hubspot";

// Minimal scope set: ChAi reads companies (customer roster) and deals
// (transactions). Nothing reads contacts, so no contacts scope is requested.
export const HUBSPOT_SCOPES = [
  "crm.objects.companies.read",
  "crm.objects.deals.read",
] as const;

// HubSpot's required external uninstall endpoint for Marketplace apps.
export const HUBSPOT_EXTERNAL_UNINSTALL_PATH = "/appinstalls/v3/external-install";

export interface UninstallOutcome {
  /** The install was active and HubSpot accepted the uninstall. */
  uninstalled: boolean;
  /** HubSpot reports no active install — treated as success (idempotent). */
  alreadyUninstalled: boolean;
}

/** Strip anything credential-shaped before an error string reaches a user. */
export function redactSecrets(text: string): string {
  return text
    .replace(/lovack_[A-Za-z0-9._-]+/g, "[redacted]")
    .replace(/pat-[A-Za-z0-9-]+/gi, "[redacted]")
    .replace(/CJ[A-Za-z0-9._-]{20,}/g, "[redacted]")
    .replace(/(access|refresh)_token"?\s*[:=]\s*"?[A-Za-z0-9._-]+/gi, "$1_token:[redacted]");
}

/**
 * DELETE /appinstalls/v3/external-install through the connector gateway.
 * 404/410 means the install is already gone, which is a success for our
 * purposes so repeated disconnects stay safe.
 */
export async function hubspotExternalUninstall(connectionKey: string): Promise<UninstallOutcome> {
  const { callAsAppUser } = await import("@/integrations/lovable/appUserConnector");
  const res = await callAsAppUser({
    gatewayBaseUrl: GATEWAY_BASE_URL,
    connectionAPIKey: connectionKey,
    connectorId: CONNECTOR_ID,
    path: HUBSPOT_EXTERNAL_UNINSTALL_PATH,
    init: { method: "DELETE" },
  });

  if (res.status === 404 || res.status === 410) {
    return { uninstalled: false, alreadyUninstalled: true };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `HubSpot uninstall failed [${res.status}]: ${redactSecrets(body).slice(0, 300)}`,
    );
  }
  return { uninstalled: true, alreadyUninstalled: false };
}

export interface DisconnectResult {
  ok: true;
  uninstalled: boolean;
  alreadyUninstalled: boolean;
}

/**
 * Full disconnect: uninstall on HubSpot first, then tear down local state.
 * If HubSpot rejects the uninstall we keep the local connection and throw, so
 * ChAi never reports "disconnected" while the HubSpot install is still active.
 */
export async function disconnectHubspotForUser(userId: string): Promise<DisconnectResult> {
  const { getConnectionKeyForUser, deleteConnectionForUser } = await import(
    "./app-user-connections.server"
  );

  let outcome: UninstallOutcome = { uninstalled: false, alreadyUninstalled: true };
  const key = await getConnectionKeyForUser(userId, CONNECTOR_ID);

  if (key) {
    // Marketplace requirement — must succeed (or report no install) before we
    // drop our own record of the connection.
    outcome = await hubspotExternalUninstall(key);

    // Best-effort: release the gateway-side connection too. A failure here
    // doesn't leave HubSpot installed, so it must not block cleanup.
    try {
      const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");
      await disconnectAppUser({
        gatewayBaseUrl: GATEWAY_BASE_URL,
        connectionAPIKey: key,
        connectorId: CONNECTOR_ID,
      });
    } catch (err) {
      console.error(
        "HubSpot gateway disconnect failed:",
        redactSecrets(err instanceof Error ? err.message : String(err)),
      );
    }
  }

  await deleteConnectionForUser(userId, CONNECTOR_ID);
  const { clearCrmSyncState } = await import("./crm.server");
  await clearCrmSyncState(userId, "hubspot" satisfies CrmProvider);

  return { ok: true, ...outcome };
}
