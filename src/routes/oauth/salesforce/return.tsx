// Salesforce App User Connector OAuth landing page (popup).
// The gateway 302s here with ?success=true&code=... — the code is a one-time
// handle, NOT the connection key. We forward it to the opener window, which
// runs the authenticated exchange server fn. Never import server-only modules
// here.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/oauth/salesforce/return")({
  head: () => ({ meta: [{ title: "Connecting Salesforce — ChAi" }] }),
  component: SalesforceOAuthReturn,
});

const CONNECTOR_ID = "salesforce";

function SalesforceOAuthReturn() {
  const [message, setMessage] = useState("Finishing connection…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const notifyOpenerAndClose = (
      type: "appUserConnectorOAuthComplete" | "appUserConnectorOAuthFailed",
      code?: string,
    ) => {
      window.opener?.postMessage(
        { type, connectorId: CONNECTOR_ID, code: code ?? null },
        window.location.origin,
      );
      window.close();
    };

    if (params.get("success") !== "true") {
      setMessage(params.get("error") ?? "Salesforce sign-in did not complete.");
      notifyOpenerAndClose("appUserConnectorOAuthFailed");
      return;
    }
    const code = params.get("code");
    // Offline access disabled: consent succeeded with no key to exchange, so
    // signal the opener and close instead of leaving it waiting.
    if (!code) {
      if (params.get("offline_access_allowed") === "false") {
        notifyOpenerAndClose("appUserConnectorOAuthComplete");
        return;
      }
      setMessage("Salesforce sign-in completed without an exchange code.");
      notifyOpenerAndClose("appUserConnectorOAuthFailed");
      return;
    }
    notifyOpenerAndClose("appUserConnectorOAuthComplete", code);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
