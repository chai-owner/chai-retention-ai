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

// Canonical scope list lives in hubspot-api.ts (shared with the connect flow).
export { HUBSPOT_SCOPES } from "./hubspot-api";

// HubSpot's external uninstall endpoint for Marketplace apps. NOTE: HubSpot
// refuses this endpoint family for user-level OAuth tokens (403 "User level
// OAuth token is not allowed for this endpoint"), which is the only token type
// an App User Connector issues. We therefore attempt it best-effort and treat
// that refusal as "not applicable" — revoking the connection at the gateway
// invalidates the user's token, which is what ends access for this user.
export const HUBSPOT_EXTERNAL_UNINSTALL_PATH = "/appinstalls/v3/external-install";

export interface UninstallOutcome {
  /** The install was active and HubSpot accepted the uninstall. */
  uninstalled: boolean;
  /** HubSpot reports no active install, or refuses the endpoint for user-level tokens. */
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

/** True when HubSpot refused the endpoint family for a user-level token. */
export function isUserLevelTokenRefusal(status: number, body: string): boolean {
  return status === 403 && /user level oauth token is not allowed/i.test(body);
}

/**
 * DELETE /appinstalls/v3/external-install through the connector gateway.
 * 404/410 means the install is already gone; 403 user-level refusal means the
 * endpoint isn't callable with this token type at all. Both are non-fatal.
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
    if (isUserLevelTokenRefusal(res.status, body)) {
      return { uninstalled: false, alreadyUninstalled: true };
    }
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
 * Full disconnect: try HubSpot's uninstall (best-effort — see the note above),
 * revoke the gateway connection so the user's token stops working, then clear
 * local state.
 */
export async function disconnectHubspotForUser(userId: string): Promise<DisconnectResult> {
  const { getConnectionKeyForUser, deleteConnectionForUser } = await import(
    "./app-user-connections.server"
  );

  let outcome: UninstallOutcome = { uninstalled: false, alreadyUninstalled: true };
  const key = await getConnectionKeyForUser(userId, CONNECTOR_ID);

  if (key) {
    try {
      outcome = await hubspotExternalUninstall(key);
    } catch (err) {
      // Never block the user's disconnect on HubSpot's app-level endpoint.
      console.error(
        "HubSpot external uninstall failed (continuing with revoke):",
        redactSecrets(err instanceof Error ? err.message : String(err)),
      );
    }

    // Revoking at the gateway invalidates this user's HubSpot token — the step
    // that actually ends access. A failure here must surface.
    const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");
    await disconnectAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionAPIKey: key,
      connectorId: CONNECTOR_ID,
    });
  }

  await deleteConnectionForUser(userId, CONNECTOR_ID);
  const { clearCrmSyncState } = await import("./crm.server");
  await clearCrmSyncState(userId, "hubspot" satisfies CrmProvider);

  return { ok: true, ...outcome };
}
