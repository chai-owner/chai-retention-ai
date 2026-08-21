# Integration Remediation — Full Program

Goal: move ChAi's nine integrations onto one hardened, organization-scoped connection architecture, fixing token lifecycle, OAuth hygiene, sync reliability and cross-platform customer identity.

Delivered in five phases. Each phase ships working and is verified before the next starts.

## Phase 1 — Critical token lifecycle (QuickBooks, Xero, FreshBooks)

The highest risk today: these three rotate refresh tokens, and a cron run overlapping a manual sync can permanently break a customer's connection.

- Add `refresh_lock_at`, `refresh_expires_at`, `status`, `last_error_at`, `last_error_message` to `accounting_connections`, mirroring the Zendesk table.
- Port Zendesk's locked-refresh routine into a shared helper: claim the lock, refresh, persist the rotated refresh token, release; losers wait and re-read.
- Refresh proactively (before expiry), not only after.
- Track FreshBooks' 12-hour refresh expiry and QuickBooks' 100-day / Xero's 60-day windows; mark `needs_reauth` instead of failing silently.
- Handle 401 as reauth-required, surfaced in the Data page with a Reconnect action.
- Revoke upstream on disconnect for QuickBooks, Xero and Intercom.

## Phase 2 — OAuth hygiene across all flows

- Add `expires_at` to `intercom_oauth_states`, `zoho_crm_oauth_states`, `accounting_oauth_states`; enforce expiry and single-use burn in each callback, matching Zendesk.
- Scheduled cleanup of expired state rows.
- Pin redirect URIs to configured environment variables (`ZOHO_REDIRECT_URI`, `INTERCOM_REDIRECT_URI`, `ACCOUNTING_REDIRECT_URI`) with the request origin used only as a preview fallback, exactly like Zendesk.
- Add PKCE for Xero and QuickBooks (both recommend it for confidential apps).
- Derive the Zoho data centre from the callback's `accounts-server` parameter instead of configuration.
- Fix the QuickBooks sandbox switch so the auth host follows `QUICKBOOKS_ENVIRONMENT`, not just the API base.
- Remove the unused PayPal secrets.

## Phase 3 — Organization tenancy

- New `organizations` and `organization_members` tables (owner/admin/member roles via the existing role pattern), with every current user auto-provisioned into a personal organization on migration so nothing breaks.
- Add `organization_id` to every connection, sync-state and ingested table; backfill from the existing `user_id`; keep `user_id` as "who connected it".
- All server functions resolve the caller's organization server-side from `context.userId`. No org id is ever accepted from the browser.
- Uniqueness moves from `(user_id, provider)` to `(organization_id, integration_type, external_account_id)`, so one organization can hold multiple accounts of the same provider.
- RLS and grants rewritten to organization membership; connection tables stay unreachable from the Data API.
- UI: a members/settings surface so teammates see and share the same connections.

## Phase 4 — Unified connection + sync engine

- One `integration_connections` table replacing the per-provider tables, with encrypted tokens, `scopes`, `status`, `last_error`, `connected_at`, `last_synced_at`, `refresh_expires_at`, `refresh_lock_at`, `external_account_id`, `external_account_name`. Data migrated from the existing tables; no connection is lost.
- One `IntegrationClient` base handling authorize, exchange, locked refresh, 401 reauth, 429 backoff with Retry-After, and cursor pagination. Each provider becomes a thin adapter; Zendesk's current module is the template.
- Full pagination for QuickBooks, HubSpot, Salesforce, Zendesk, Intercom and Freshdesk (all currently single-page or capped).
- Per-connection error state persisted so a silently dead sync is visible in the UI.
- Cron reworked to iterate connections with per-tenant throttling and a time budget, so one stalled tenant cannot starve the rest.

## Phase 5 — Cross-platform customer identity

- New `customer_external_ids` table: ChAi customer -> (platform, account scope, external id). The account scope carries the QuickBooks realm and Xero tenant, which are currently missing from customer keys.
- Sync adapters write platform ids there instead of overloading the shared `customer_id` field; the ingested rows keep a ChAi-owned key.
- Matching engine reads from the new table: exact id within platform, then normalized email, then name/company, with existing confidence scoring, manual resolution and alias persistence preserved.
- Backfill existing rows using their `__source` stamp so no current match is lost.

## Technical notes

- Encryption stays AES-256-GCM via `connection-key-crypto.server.ts` with the `enc:v1:` prefix; no key rotation in this program.
- Every migration is additive-then-backfill-then-switch, so each phase is independently revertible and no test data is deleted.
- Test coverage extended per phase: locked refresh under concurrency, state expiry/replay, org-scoped access denial across two organizations, pagination beyond one page, and external-id collision between two platforms.
- Zendesk stays as-is functionally; it becomes the first adapter migrated onto the shared client.

## Dependencies on you

- Zendesk global client approval is still pending. Everything below Zendesk proceeds without it; the Zendesk connect path stays on the current implementation until the client is issued, then only the client id/secret change.
- Xero app publication, Intuit production review and Intercom app-store review are required before external customers can connect at volume. Phases 1-2 put the code in a state that passes those reviews; the submissions are yours to file.
- New environment variables will be requested when Phase 2 lands.
