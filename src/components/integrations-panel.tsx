// Shared integrations UI: support tools, CRM, and accounting connections.
// Used on both the Data & Integrations page and the onboarding "Connect your
// integrations" step so they stay identical.
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Check, Link2, Loader2, MessageCircle, Receipt, Ticket } from "lucide-react";
import { Card } from "@/components/ui/chai";
import { integrations, crmIntegrations, accountingIntegrations } from "@/lib/mock-data";
import { CrmSyncWizard } from "@/components/crm-sync-wizard";
import { AccountingSyncWizard } from "@/components/accounting-sync-wizard";
import type { CrmProvider } from "@/lib/crm.functions";
import {
  startSalesforceConnect,
  saveSalesforceConnection,
  getSalesforceStatus,
  disconnectSalesforce,
} from "@/lib/salesforce.functions";
import {
  startHubspotConnect,
  saveHubspotConnection,
  getHubspotStatus,
  disconnectHubspot,
} from "@/lib/hubspot.functions";
import {
  startZohoConnect,
  getZohoStatus,
  disconnectZoho,
  getZohoConfig,
} from "@/lib/zoho.functions";
import {
  startZendeskConnect,
  getZendeskStatus,
  disconnectZendesk,
  getZendeskConfig,
} from "@/lib/zendesk.functions";
import {
  startIntercomConnect,
  getIntercomStatus,
  disconnectIntercom,
  getIntercomConfig,
} from "@/lib/intercom.functions";
import {
  connectFreshdesk,
  getFreshdeskStatus,
  disconnectFreshdesk,
} from "@/lib/freshdesk.functions";
import { syncZendesk, syncSupport } from "@/lib/support.functions";
import { connectAppUser } from "@/integrations/lovable/appUserConnectorClient";
import {
  getAccountingStatus,
  getAccountingConfig,
  startAccountingOAuth,
  disconnectAccounting,
  selectXeroTenant,
  type AccountingProvider,
} from "@/lib/accounting.functions";
import { useUploads } from "@/lib/uploads-store";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";

const CRM_PROVIDER_BY_NAME: Record<string, CrmProvider> = {
  Salesforce: "salesforce",
  HubSpot: "hubspot",
  "Zoho CRM": "zoho_crm",
};

const ACCOUNTING_PROVIDER_BY_NAME: Record<string, AccountingProvider> = {
  "QuickBooks Online": "quickbooks",
  Xero: "xero",
  FreshBooks: "freshbooks",
};

const ACCOUNTING_PROVIDERS_NAME: Record<AccountingProvider, string> = {
  quickbooks: "QuickBooks Online",
  xero: "Xero",
  freshbooks: "FreshBooks",
};

type AccountingStatus = {
  provider: AccountingProvider;
  company_name: string | null;
  connected_at: string;
  tenant_id: string | null;
  tenants: { tenantId: string; tenantName: string }[] | null;
};

export function IntegrationsPanel() {
  return (
    <>
      <Card className="mt-6">
        <h3 className="font-semibold">Connect your support tools</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Support interactions are one of the strongest churn signals. Connect securely with OAuth.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <SupportSection />
        </div>
      </Card>

      <Card className="mt-6">
        <h3 className="font-semibold">Connect your CRM</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Bring in accounts, deals and renewal stages so ChAi can factor CRM signals into customer health and insights. Connect securely with OAuth.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {crmIntegrations.map((it) => (
            <CrmCard key={it.name} name={it.name} category={it.category} desc={it.desc} />
          ))}
        </div>
      </Card>

      <AccountingSection />
    </>
  );
}

function CrmCard({ name, category, desc }: { name: string; category: string; desc: string }) {
  const provider = CRM_PROVIDER_BY_NAME[name];
  if (provider === "salesforce") {
    return <SalesforceCard name={name} category={category} desc={desc} />;
  }
  if (provider === "hubspot") {
    return <HubspotCard name={name} category={category} desc={desc} />;
  }
  if (provider === "zoho_crm") {
    return <ZohoCrmCard name={name} category={category} desc={desc} />;
  }
  return <GenericCrmCard name={name} category={category} desc={desc} />;
}

function GenericCrmCard({ name, category, desc }: { name: string; category: string; desc: string }) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const uploads = useUploads();
  const provider = CRM_PROVIDER_BY_NAME[name];

  const lastSynced = useMemo(() => {
    const prefix = `${name} —`;
    let latest: string | undefined;
    for (const u of uploads) {
      if (u.fileName.startsWith(prefix) && (!latest || u.uploadedAt > latest)) {
        latest = u.uploadedAt;
      }
    }
    return latest;
  }, [uploads, name]);

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-primary">
          <Building2 className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold">{name}</p>
          <p className="text-[11px] text-muted-foreground">{category}</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{desc}</p>
      <button
        onClick={() => setWizardOpen(true)}
        className="mt-3 w-full rounded-lg border border-border py-2 text-sm font-medium transition-colors hover:bg-accent"
      >
        {lastSynced ? "Sync now" : "Connect & sync"}
      </button>
      {lastSynced && (
        <p className="mt-1.5 text-center text-[11px] italic text-success">Last synced {lastSynced}</p>
      )}
      {provider && (
        <CrmSyncWizard
          provider={provider}
          providerName={name}
          open={wizardOpen}
          onOpenChange={setWizardOpen}
        />
      )}
    </div>
  );
}

type SfStatus =
  | { connected: false }
  | { connected: true; orgName: string | null; connectedAt: string };

function SalesforceCard({ name, category, desc }: { name: string; category: string; desc: string }) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [status, setStatus] = useState<SfStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const uploads = useUploads();

  const fetchStatus = useServerFn(getSalesforceStatus);
  const startConnect = useServerFn(startSalesforceConnect);
  const saveConnection = useServerFn(saveSalesforceConnection);
  const disconnect = useServerFn(disconnectSalesforce);

  const refresh = async () => {
    try {
      const s = (await fetchStatus()) as SfStatus;
      setStatus(s);
    } catch {
      setStatus({ connected: false });
    }
  };

  useEffect(() => {
    refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const lastSynced = useMemo(() => {
    const prefix = `${name} —`;
    let latest: string | undefined;
    for (const u of uploads) {
      if (u.fileName.startsWith(prefix) && (!latest || u.uploadedAt > latest)) {
        latest = u.uploadedAt;
      }
    }
    return latest;
  }, [uploads, name]);

  async function handleConnect() {
    setConnecting(true);
    try {
      const result = await connectAppUser({
        connectorId: "salesforce",
        gatewayBaseUrl: GATEWAY_BASE_URL,
        start: async (targetOrigin) => {
          const r = (await startConnect({ data: { targetOrigin } })) as {
            authorizationUrl: string;
          };
          return { authorizationUrl: r.authorizationUrl };
        },
      });
      if (!result.success) {
        if (result.error) toast.error("Couldn’t connect Salesforce", { description: result.error });
        return;
      }
      if (!result.connectionAPIKey) {
        toast.error("Salesforce offline access disabled", {
          description: "Ask a workspace admin to enable offline access on the connector client.",
        });
        return;
      }
      const saved = (await saveConnection({
        data: { connectionAPIKey: result.connectionAPIKey },
      })) as { orgName: string | null };
      toast.success("Salesforce connected", {
        description: saved.orgName ? `Linked to ${saved.orgName}.` : "You can now sync your data.",
      });
      await refresh();
    } catch (e) {
      toast.error("Couldn’t connect Salesforce", {
        description: e instanceof Error ? e.message : "Please try again.",
      });
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    try {
      await disconnect();
      toast.success("Salesforce disconnected");
      await refresh();
    } catch (e) {
      toast.error("Couldn’t disconnect", {
        description: e instanceof Error ? e.message : "Please try again.",
      });
    }
  }

  const connected = status?.connected === true;

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-primary">
          <Building2 className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold">{name}</p>
          <p className="text-[11px] text-muted-foreground">{category}</p>
        </div>
        {connected && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
            <Check className="h-3 w-3" /> Connected
          </span>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{desc}</p>

      {status === null ? (
        <div className="mt-3 flex items-center justify-center py-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : connected ? (
        <>
          <button
            onClick={() => setWizardOpen(true)}
            className="mt-3 w-full rounded-lg border border-border py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            Sync now
          </button>
          <div className="mt-1.5 flex items-center justify-center gap-2 text-[11px]">
            {status.connected && status.orgName && (
              <span className="text-muted-foreground">{status.orgName}</span>
            )}
            <button
              onClick={handleDisconnect}
              className="text-muted-foreground underline-offset-2 hover:text-danger hover:underline"
            >
              Disconnect
            </button>
          </div>
          {lastSynced && (
            <p className="mt-1 text-center text-[11px] italic text-success">Last synced {lastSynced}</p>
          )}
        </>
      ) : (
        <button
          onClick={handleConnect}
          disabled={connecting}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-border py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
        >
          {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          {connecting ? "Connecting…" : "Connect with OAuth"}
        </button>
      )}

      <CrmSyncWizard
        provider="salesforce"
        providerName={name}
        open={wizardOpen}
        onOpenChange={setWizardOpen}
      />
    </div>
  );
}

type HubspotStatus =
  | { connected: false }
  | { connected: true; portalName: string | null; connectedAt: string };

function HubspotCard({ name, category, desc }: { name: string; category: string; desc: string }) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [status, setStatus] = useState<HubspotStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const uploads = useUploads();

  const fetchStatus = useServerFn(getHubspotStatus);
  const startConnect = useServerFn(startHubspotConnect);
  const saveConnection = useServerFn(saveHubspotConnection);
  const disconnect = useServerFn(disconnectHubspot);

  const refresh = async () => {
    try {
      const s = (await fetchStatus()) as HubspotStatus;
      setStatus(s);
    } catch {
      setStatus({ connected: false });
    }
  };

  useEffect(() => {
    refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const lastSynced = useMemo(() => {
    const prefix = `${name} —`;
    let latest: string | undefined;
    for (const u of uploads) {
      if (u.fileName.startsWith(prefix) && (!latest || u.uploadedAt > latest)) {
        latest = u.uploadedAt;
      }
    }
    return latest;
  }, [uploads, name]);

  async function handleConnect() {
    setConnecting(true);
    try {
      const result = await connectAppUser({
        connectorId: "hubspot",
        gatewayBaseUrl: GATEWAY_BASE_URL,
        start: async (targetOrigin) => {
          const r = (await startConnect({ data: { targetOrigin } })) as {
            authorizationUrl: string;
          };
          return { authorizationUrl: r.authorizationUrl };
        },
      });
      if (!result.success) {
        if (result.error) toast.error("Couldn’t connect HubSpot", { description: result.error });
        return;
      }
      if (!result.connectionAPIKey) {
        toast.error("HubSpot offline access disabled", {
          description: "Ask a workspace admin to enable offline access on the connector client.",
        });
        return;
      }
      const saved = (await saveConnection({
        data: { connectionAPIKey: result.connectionAPIKey },
      })) as { portalName: string | null };
      toast.success("HubSpot connected", {
        description: saved.portalName ? `Linked to ${saved.portalName}.` : "You can now sync your data.",
      });
      await refresh();
    } catch (e) {
      toast.error("Couldn’t connect HubSpot", {
        description: e instanceof Error ? e.message : "Please try again.",
      });
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    try {
      await disconnect();
      toast.success("HubSpot disconnected");
      await refresh();
    } catch (e) {
      toast.error("Couldn’t disconnect", {
        description: e instanceof Error ? e.message : "Please try again.",
      });
    }
  }

  const connected = status?.connected === true;

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-primary">
          <Building2 className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold">{name}</p>
          <p className="text-[11px] text-muted-foreground">{category}</p>
        </div>
        {connected && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
            <Check className="h-3 w-3" /> Connected
          </span>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{desc}</p>

      {status === null ? (
        <div className="mt-3 flex items-center justify-center py-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : connected ? (
        <>
          <button
            onClick={() => setWizardOpen(true)}
            className="mt-3 w-full rounded-lg border border-border py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            Sync now
          </button>
          <div className="mt-1.5 flex items-center justify-center gap-2 text-[11px]">
            {status.connected && status.portalName && (
              <span className="text-muted-foreground">{status.portalName}</span>
            )}
            <button
              onClick={handleDisconnect}
              className="text-muted-foreground underline-offset-2 hover:text-danger hover:underline"
            >
              Disconnect
            </button>
          </div>
          {lastSynced && (
            <p className="mt-1 text-center text-[11px] italic text-success">Last synced {lastSynced}</p>
          )}
        </>
      ) : (
        <button
          onClick={handleConnect}
          disabled={connecting}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-border py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
        >
          {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          {connecting ? "Connecting…" : "Connect with OAuth"}
        </button>
      )}

      <CrmSyncWizard
        provider="hubspot"
        providerName={name}
        open={wizardOpen}
        onOpenChange={setWizardOpen}
      />
    </div>
  );
}

type ZohoStatus =
  | { connected: false }
  | { connected: true; orgName: string | null; connectedAt: string };

function ZohoCrmCard({ name, category, desc }: { name: string; category: string; desc: string }) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [status, setStatus] = useState<ZohoStatus | null>(null);
  const [config, setConfig] = useState<{ configured: boolean } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const uploads = useUploads();

  const fetchStatus = useServerFn(getZohoStatus);
  const fetchConfig = useServerFn(getZohoConfig);
  const startConnect = useServerFn(startZohoConnect);
  const disconnect = useServerFn(disconnectZoho);

  const refresh = async () => {
    try {
      const [s, c] = await Promise.all([fetchStatus(), fetchConfig()]);
      setStatus(s as ZohoStatus);
      setConfig(c as { configured: boolean });
    } catch {
      setStatus({ connected: false });
      setConfig({ configured: false });
    }
  };

  useEffect(() => {
    refresh();
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("zoho_connected");
    const err = params.get("zoho_error");
    if (connected) {
      toast.success("Zoho CRM connected", {
        description: "You can now sync accounts and deals into ChAi.",
      });
    }
    if (err) toast.error("Zoho CRM connection failed", { description: err });
    if (connected || err) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const lastSynced = useMemo(() => {
    const prefix = `${name} —`;
    let latest: string | undefined;
    for (const u of uploads) {
      if (u.fileName.startsWith(prefix) && (!latest || u.uploadedAt > latest)) latest = u.uploadedAt;
    }
    return latest;
  }, [uploads, name]);

  async function handleConnect() {
    setConnecting(true);
    try {
      const r = (await startConnect({ data: { origin: window.location.origin } })) as { url: string };
      window.location.href = r.url;
    } catch (e) {
      setConnecting(false);
      toast.error("Couldn’t start Zoho connect", {
        description: e instanceof Error ? e.message : "Please try again.",
      });
    }
  }

  async function handleDisconnect() {
    try {
      await disconnect();
      toast.success("Zoho CRM disconnected");
      await refresh();
    } catch (e) {
      toast.error("Couldn’t disconnect", {
        description: e instanceof Error ? e.message : "Please try again.",
      });
    }
  }

  const connected = status?.connected === true;

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-primary">
          <Building2 className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold">{name}</p>
          <p className="text-[11px] text-muted-foreground">{category}</p>
        </div>
        {connected && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
            <Check className="h-3 w-3" /> Connected
          </span>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{desc}</p>

      {status === null ? (
        <div className="mt-3 flex items-center justify-center py-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : connected ? (
        <>
          <button
            onClick={() => setWizardOpen(true)}
            className="mt-3 w-full rounded-lg border border-border py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            Sync now
          </button>
          <div className="mt-1.5 flex items-center justify-center gap-2 text-[11px]">
            {status.connected && status.orgName && (
              <span className="text-muted-foreground">{status.orgName}</span>
            )}
            <button
              onClick={handleDisconnect}
              className="text-muted-foreground underline-offset-2 hover:text-danger hover:underline"
            >
              Disconnect
            </button>
          </div>
          {lastSynced && (
            <p className="mt-1 text-center text-[11px] italic text-success">Last synced {lastSynced}</p>
          )}
        </>
      ) : (
        <button
          onClick={handleConnect}
          disabled={connecting || (config !== null && !config.configured)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-border py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
          title={config && !config.configured ? "Zoho CRM isn't configured on this project." : undefined}
        >
          {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          {connecting ? "Redirecting…" : "Connect with OAuth"}
        </button>
      )}

      <CrmSyncWizard
        provider="zoho_crm"
        providerName={name}
        open={wizardOpen}
        onOpenChange={setWizardOpen}
      />
    </div>
  );
}


function SupportSection() {
  return (
    <>
      {integrations.map((it) => {
        if (it.name === "Zendesk") {
          return <ZendeskCard key={it.name} name={it.name} category={it.category} desc={it.desc} />;
        }
        if (it.name === "Intercom") {
          return <IntercomCard key={it.name} name={it.name} category={it.category} desc={it.desc} />;
        }
        if (it.name === "Freshdesk") {
          return <FreshdeskCard key={it.name} name={it.name} category={it.category} desc={it.desc} />;
        }
        return <GenericSupportCard key={it.name} name={it.name} category={it.category} desc={it.desc} />;
      })}
    </>
  );
}

function GenericSupportCard({ name, category, desc }: { name: string; category: string; desc: string }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-primary">
          <Link2 className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold">{name}</p>
          <p className="text-[11px] text-muted-foreground">{category}</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{desc}</p>
      <button
        onClick={() => toast.info(`Connect ${name}`, { description: "Demo mode — OAuth flow not enabled." })}
        className="mt-3 w-full rounded-lg border border-border py-2 text-sm font-medium transition-colors hover:bg-accent"
      >
        Connect
      </button>
    </div>
  );
}

type ZendeskStatus =
  | { connected: false }
  | { connected: true; orgName: string | null; subdomain: string; connectedAt: string; lastSyncedAt: string | null };

function ZendeskCard({ name, category, desc }: { name: string; category: string; desc: string }) {
  const [status, setStatus] = useState<ZendeskStatus | null>(null);
  const [config, setConfig] = useState<{ configured: boolean } | null>(null);
  const [subdomain, setSubdomain] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const fetchStatus = useServerFn(getZendeskStatus);
  const fetchConfig = useServerFn(getZendeskConfig);
  const startConnect = useServerFn(startZendeskConnect);
  const disconnect = useServerFn(disconnectZendesk);
  const sync = useServerFn(syncZendesk);

  const refresh = async () => {
    try {
      const [s, c] = await Promise.all([fetchStatus(), fetchConfig()]);
      setStatus(s as ZendeskStatus);
      setConfig(c as { configured: boolean });
    } catch {
      setStatus({ connected: false });
      setConfig({ configured: false });
    }
  };

  useEffect(() => {
    refresh();
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("zendesk_connected");
    const err = params.get("zendesk_error");
    if (connected) {
      toast.success("Zendesk connected", { description: "You can now sync support tickets into ChAi." });
    }
    if (err) toast.error("Zendesk connection failed", { description: err });
    if (connected || err) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleConnect() {
    if (!subdomain.trim()) return;
    setConnecting(true);
    try {
      const r = (await startConnect({ data: { origin: window.location.origin, subdomain: subdomain.trim() } })) as { url: string };
      window.location.href = r.url;
    } catch (e) {
      setConnecting(false);
      toast.error("Couldn’t start Zendesk connect", {
        description: e instanceof Error ? e.message : "Please try again.",
      });
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = (await sync({ data: { provider: "zendesk" } })) as { providerName: string; rows: number };
      toast.success(`${res.providerName} sync complete`, {
        description: `${res.rows} ticket${res.rows === 1 ? "" : "s"} imported.`,
      });
      await refresh();
    } catch (e) {
      toast.error("Couldn’t sync Zendesk", {
        description: e instanceof Error ? e.message : "Please try again.",
      });
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    try {
      await disconnect();
      toast.success("Zendesk disconnected");
      setSubdomain("");
      await refresh();
    } catch (e) {
      toast.error("Couldn’t disconnect", {
        description: e instanceof Error ? e.message : "Please try again.",
      });
    }
  }

  const connected = status?.connected === true;

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-primary">
          <Ticket className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold">{name}</p>
          <p className="text-[11px] text-muted-foreground">{category}</p>
        </div>
        {connected && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
            <Check className="h-3 w-3" /> Connected
          </span>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{desc}</p>

      {status === null ? (
        <div className="mt-3 flex items-center justify-center py-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : connected ? (
        <>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-border py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
          >
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            {syncing ? "Syncing…" : "Sync now"}
          </button>
          <div className="mt-1.5 flex items-center justify-center gap-2 text-[11px]">
            {status.connected && status.subdomain && (
              <span className="text-muted-foreground">{status.subdomain}.zendesk.com</span>
            )}
            <button
              onClick={handleDisconnect}
              className="text-muted-foreground underline-offset-2 hover:text-danger hover:underline"
            >
              Disconnect
            </button>
          </div>
          {status.connected && status.lastSyncedAt && (
            <p className="mt-1 text-center text-[11px] italic text-success">
              Last synced {status.lastSyncedAt.slice(0, 16).replace("T", " ")}
            </p>
          )}
        </>
      ) : (
        <>
          <div className="mt-3">
            <label className="block text-[11px] font-medium text-muted-foreground">Zendesk subdomain</label>
            <div className="mt-1 flex items-stretch gap-2">
              <input
                type="text"
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="yourcompany"
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <span className="flex items-center rounded-lg border border-border bg-secondary px-3 text-xs text-muted-foreground">
                .zendesk.com
              </span>
            </div>
          </div>
          <button
            onClick={handleConnect}
            disabled={connecting || (config !== null && !config.configured) || !subdomain.trim()}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-border py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
            title={config && !config.configured ? "Zendesk isn't configured on this project." : undefined}
          >
            {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            {connecting ? "Redirecting…" : "Connect with OAuth"}
          </button>
        </>
      )}
    </div>
  );
}

function AccountingSection() {
  const [status, setStatus] = useState<AccountingStatus[]>([]);
  const [config, setConfig] = useState<Record<AccountingProvider, boolean> | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchStatus = useServerFn(getAccountingStatus);
  const fetchConfig = useServerFn(getAccountingConfig);

  const refresh = async () => {
    try {
      const [s, c] = await Promise.all([fetchStatus(), fetchConfig()]);
      setStatus(s as AccountingStatus[]);
      setConfig(c as Record<AccountingProvider, boolean>);
    } catch {
      /* ignore — cards fall back to a connect prompt */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("accounting_connected");
    const err = params.get("accounting_error");
    if (connected) {
      const name = ACCOUNTING_PROVIDERS_NAME[connected as AccountingProvider] ?? connected;
      toast.success(`${name} connected`, {
        description: "You can now sync customers and invoices into ChAi.",
      });
    }
    if (err) {
      toast.error("Connection failed", { description: err });
    }
    if (connected || err) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card className="mt-6">
      <h3 className="font-semibold">Connect your accounting tools</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Your accounting system knows what customers actually buy and how often. Connect it so ChAi can pull customers and invoices to reveal spend, buying cadence and lifetime value. You authorize securely with OAuth — ChAi never sees your password.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {accountingIntegrations.map((it) => (
          <AccountingCard
            key={it.name}
            name={it.name}
            category={it.category}
            desc={it.desc}
            loading={loading}
            connected={status.find((s) => s.provider === ACCOUNTING_PROVIDER_BY_NAME[it.name])}
            configured={config ? config[ACCOUNTING_PROVIDER_BY_NAME[it.name]] : true}
            onChanged={refresh}
          />
        ))}
      </div>
    </Card>
  );
}

function AccountingCard({
  name,
  category,
  desc,
  loading,
  connected,
  configured,
  onChanged,
}: {
  name: string;
  category: string;
  desc: string;
  loading: boolean;
  connected?: AccountingStatus;
  configured: boolean;
  onChanged: () => void;
}) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const uploads = useUploads();
  const provider = ACCOUNTING_PROVIDER_BY_NAME[name];
  const startOAuth = useServerFn(startAccountingOAuth);
  const disconnect = useServerFn(disconnectAccounting);
  const pickTenant = useServerFn(selectXeroTenant);
  const xeroTenants = provider === "xero" ? (connected?.tenants ?? []) : [];

  const lastSynced = useMemo(() => {
    const prefix = `${name} —`;
    let latest: string | undefined;
    for (const u of uploads) {
      if (u.fileName.startsWith(prefix) && (!latest || u.uploadedAt > latest)) {
        latest = u.uploadedAt;
      }
    }
    return latest;
  }, [uploads, name]);

  async function handleConnect() {
    setConnecting(true);
    try {
      const { url } = await startOAuth({
        data: { provider, origin: window.location.origin },
      });
      window.location.href = url;
    } catch (e) {
      setConnecting(false);
      toast.error("Couldn’t start connection", {
        description: e instanceof Error ? e.message : "Please try again.",
      });
    }
  }

  async function handleDisconnect() {
    try {
      await disconnect({ data: { provider } });
      toast.success(`${name} disconnected`);
      onChanged();
    } catch (e) {
      toast.error("Couldn’t disconnect", {
        description: e instanceof Error ? e.message : "Please try again.",
      });
    }
  }

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-primary">
          <Receipt className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold">{name}</p>
          <p className="text-[11px] text-muted-foreground">{category}</p>
        </div>
        {connected && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
            <Check className="h-3 w-3" /> Connected
          </span>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{desc}</p>

      {loading ? (
        <div className="mt-3 flex items-center justify-center py-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : !configured ? (
        <div className="mt-3 rounded-lg border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground">
          Add your {name} developer app credentials to enable this connection.
        </div>
      ) : connected ? (
        <>
          <button
            onClick={() => setWizardOpen(true)}
            className="mt-3 w-full rounded-lg border border-border py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            Sync now
          </button>
          <div className="mt-1.5 flex items-center justify-center gap-2 text-[11px]">
            {connected.company_name && (
              <span className="text-muted-foreground">{connected.company_name}</span>
            )}
            <button
              onClick={handleDisconnect}
              className="text-muted-foreground underline-offset-2 hover:text-danger hover:underline"
            >
              Disconnect
            </button>
          </div>
          {xeroTenants.length > 1 && (
            <div className="mt-2">
              <label className="text-[11px] text-muted-foreground" htmlFor="xero-org">
                Organisation to sync
              </label>
              <select
                id="xero-org"
                value={connected.tenant_id ?? ""}
                onChange={async (e) => {
                  const value = e.target.value || null;
                  try {
                    await pickTenant({ data: { tenantId: value } });
                    onChanged();
                  } catch (err) {
                    toast.error("Couldn’t change organisation", {
                      description: err instanceof Error ? err.message : "Please try again.",
                    });
                  }
                }}
                className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
              >
                <option value="">All organisations ({xeroTenants.length})</option>
                {xeroTenants.map((t) => (
                  <option key={t.tenantId} value={t.tenantId}>
                    {t.tenantName}
                  </option>
                ))}
              </select>
            </div>
          )}
          {lastSynced && (
            <p className="mt-1 text-center text-[11px] italic text-success">
              Last synced {lastSynced}
            </p>
          )}
        </>
      ) : (
        <button
          onClick={handleConnect}
          disabled={connecting}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-border py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
        >
          {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          {connecting ? "Redirecting…" : "Connect with OAuth"}
        </button>
      )}

      {provider && connected && (
        <AccountingSyncWizard
          provider={provider}
          providerName={name}
          open={wizardOpen}
          onOpenChange={setWizardOpen}
        />
      )}
    </div>
  );
}

type IntercomStatus =
  | { connected: false }
  | { connected: true; workspaceName: string | null; workspaceId: string | null; connectedAt: string; lastSyncedAt: string | null };

function IntercomCard({ name, category, desc }: { name: string; category: string; desc: string }) {
  const [status, setStatus] = useState<IntercomStatus | null>(null);
  const [config, setConfig] = useState<{ configured: boolean } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const fetchStatus = useServerFn(getIntercomStatus);
  const fetchConfig = useServerFn(getIntercomConfig);
  const startConnect = useServerFn(startIntercomConnect);
  const disconnect = useServerFn(disconnectIntercom);
  const sync = useServerFn(syncZendesk); // shared support sync fn

  const refresh = async () => {
    try {
      const [s, c] = await Promise.all([fetchStatus(), fetchConfig()]);
      setStatus(s as IntercomStatus);
      setConfig(c as { configured: boolean });
    } catch {
      setStatus({ connected: false });
      setConfig({ configured: false });
    }
  };

  useEffect(() => {
    refresh();
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("intercom_connected");
    const err = params.get("intercom_error");
    if (connected) {
      toast.success("Intercom connected", {
        description: "You can now sync support conversations into ChAi.",
      });
    }
    if (err) toast.error("Intercom connection failed", { description: err });
    if (connected || err) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleConnect() {
    setConnecting(true);
    try {
      const r = (await startConnect({ data: { origin: window.location.origin } })) as { url: string };
      window.location.href = r.url;
    } catch (e) {
      setConnecting(false);
      toast.error("Couldn’t start Intercom connect", {
        description: e instanceof Error ? e.message : "Please try again.",
      });
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = (await sync({ data: { provider: "intercom" } })) as {
        providerName: string;
        rows: number;
      };
      toast.success(`${res.providerName} sync complete`, {
        description: `${res.rows} conversation${res.rows === 1 ? "" : "s"} imported.`,
      });
      await refresh();
    } catch (e) {
      toast.error("Couldn’t sync Intercom", {
        description: e instanceof Error ? e.message : "Please try again.",
      });
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    try {
      await disconnect();
      toast.success("Intercom disconnected");
      await refresh();
    } catch (e) {
      toast.error("Couldn’t disconnect", {
        description: e instanceof Error ? e.message : "Please try again.",
      });
    }
  }

  const connected = status?.connected === true;

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-primary">
          <MessageCircle className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold">{name}</p>
          <p className="text-[11px] text-muted-foreground">{category}</p>
        </div>
        {connected && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
            <Check className="h-3 w-3" /> Connected
          </span>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{desc}</p>

      {status === null ? (
        <div className="mt-3 flex items-center justify-center py-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : connected ? (
        <>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-border py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
          >
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            {syncing ? "Syncing…" : "Sync now"}
          </button>
          <div className="mt-1.5 flex items-center justify-center gap-2 text-[11px]">
            {status.connected && status.workspaceName && (
              <span className="text-muted-foreground">{status.workspaceName}</span>
            )}
            <button
              onClick={handleDisconnect}
              className="text-muted-foreground underline-offset-2 hover:text-danger hover:underline"
            >
              Disconnect
            </button>
          </div>
          {status.connected && status.lastSyncedAt && (
            <p className="mt-1 text-center text-[11px] italic text-success">
              Last synced {status.lastSyncedAt.slice(0, 16).replace("T", " ")}
            </p>
          )}
        </>
      ) : (
        <button
          onClick={handleConnect}
          disabled={connecting || (config !== null && !config.configured)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-border py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
          title={config && !config.configured ? "Intercom isn't configured on this project." : undefined}
        >
          {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          {connecting ? "Redirecting…" : "Connect with OAuth"}
        </button>
      )}
    </div>
  );
}

// ---------------- Freshdesk ----------------

type FreshdeskStatus =
  | { connected: false }
  | { connected: true; domain: string; connectedAt: string; lastSyncedAt: string | null };

function FreshdeskCard({ name, category, desc }: { name: string; category: string; desc: string }) {
  const [status, setStatus] = useState<FreshdeskStatus | null>(null);
  const [domain, setDomain] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const fetchStatus = useServerFn(getFreshdeskStatus);
  const connect = useServerFn(connectFreshdesk);
  const disconnect = useServerFn(disconnectFreshdesk);
  const sync = useServerFn(syncSupport);

  const refresh = async () => {
    try {
      const s = (await fetchStatus()) as FreshdeskStatus;
      setStatus(s);
    } catch {
      setStatus({ connected: false });
    }
  };

  useEffect(() => {
    refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleConnect() {
    if (!domain.trim() || !apiKey.trim()) return;
    setConnecting(true);
    try {
      const r = (await connect({
        data: { domain: domain.trim(), apiKey: apiKey.trim() },
      })) as { accountName: string | null };
      toast.success("Freshdesk connected", {
        description: r.accountName
          ? `Linked to ${r.accountName}.`
          : "You can now sync support tickets into ChAi.",
      });
      setApiKey("");
      await refresh();
    } catch (e) {
      toast.error("Couldn’t connect Freshdesk", {
        description: e instanceof Error ? e.message : "Please try again.",
      });
    } finally {
      setConnecting(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = (await sync({ data: { provider: "freshdesk" } })) as {
        providerName: string;
        rows: number;
      };
      toast.success(`${res.providerName} sync complete`, {
        description: `${res.rows} ticket${res.rows === 1 ? "" : "s"} imported.`,
      });
      await refresh();
    } catch (e) {
      toast.error("Couldn’t sync Freshdesk", {
        description: e instanceof Error ? e.message : "Please try again.",
      });
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    try {
      await disconnect();
      toast.success("Freshdesk disconnected");
      setDomain("");
      await refresh();
    } catch (e) {
      toast.error("Couldn’t disconnect", {
        description: e instanceof Error ? e.message : "Please try again.",
      });
    }
  }

  const connected = status?.connected === true;

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-primary">
          <Ticket className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold">{name}</p>
          <p className="text-[11px] text-muted-foreground">{category}</p>
        </div>
        {connected && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
            <Check className="h-3 w-3" /> Connected
          </span>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{desc}</p>

      {status === null ? (
        <div className="mt-3 flex items-center justify-center py-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : connected ? (
        <>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-border py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
          >
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            {syncing ? "Syncing…" : "Sync now"}
          </button>
          <div className="mt-1.5 flex items-center justify-center gap-2 text-[11px]">
            {status.connected && status.domain && (
              <span className="text-muted-foreground">{status.domain}.freshdesk.com</span>
            )}
            <button
              onClick={handleDisconnect}
              className="text-muted-foreground underline-offset-2 hover:text-danger hover:underline"
            >
              Disconnect
            </button>
          </div>
          {status.connected && status.lastSyncedAt && (
            <p className="mt-1 text-center text-[11px] italic text-success">
              Last synced {status.lastSyncedAt.slice(0, 16).replace("T", " ")}
            </p>
          )}
        </>
      ) : (
        <>
          <div className="mt-3">
            <label className="block text-[11px] font-medium text-muted-foreground">Freshdesk domain</label>
            <div className="mt-1 flex items-stretch gap-2">
              <input
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="yourcompany"
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <span className="flex items-center rounded-lg border border-border bg-secondary px-3 text-xs text-muted-foreground">
                .freshdesk.com
              </span>
            </div>
          </div>
          <div className="mt-2">
            <label className="block text-[11px] font-medium text-muted-foreground">API key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Found in Freshdesk → Profile → View API Key"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <button
            onClick={handleConnect}
            disabled={connecting || !domain.trim() || !apiKey.trim()}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-border py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
          >
            {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            {connecting ? "Connecting…" : "Connect"}
          </button>
          <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
            Your API key is stored encrypted.
          </p>
        </>
      )}
    </div>
  );
}
