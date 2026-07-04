## Goal

Make the CRM tiles on the Data page (Salesforce, HubSpot, Zoho CRM) actually pull real records into ChAi, mapping CRM data into the existing datasets, instead of showing the demo "OAuth not enabled" toast.

## What data each CRM will accept (and where it lands)

CRM data maps into ChAi's existing dataset schemas (`src/lib/data-schemas.ts`) so the rest of the app (health scoring, risk, churn) works unchanged:

```text
CRM object                         → ChAi dataset      → key fields
Accounts / Companies / Contacts    → Customers         customer_id, name, email, signup_date,
                                                        monthly_revenue, plan, region, status
Deals / Opportunities / Invoices   → Transactions      customer_id, transaction_id, amount,
                                                        transaction_date, product, currency
Engagement / activity / touchpoints→ Product usage     customer_id, date, logins/active signal
Renewal / lifecycle / pipeline     → Customer status   feeds churn definition + lifecycle
```

Per CRM:
- **Salesforce** — `Account` (Customers), `Opportunity` (Transactions/renewals), `Contact` (email/owner), activity (usage signal).
- **HubSpot** — `companies`/`contacts` (Customers), `deals` (Transactions), engagement events (usage), lifecycle stage (status).
- **Zoho CRM** — `Accounts`/`Contacts` (Customers), `Deals` (Transactions/pipeline), touchpoints (usage).

## Important decision needed: whose CRM?

Lovable's standard connectors authenticate **one workspace/builder account**, not each signed-in end user. Two paths:

- **A — Connector (single account):** fastest. Good if ChAi connects to *your* CRM (single tenant / internal demo). Uses `standard_connectors--connect` and the connector gateway. This plan assumes A.
- **B — Per-user OAuth:** required if every ChAi customer connects *their own* CRM. Needs provider OAuth apps + per-user token storage — a much larger build. Flag if this is the target.

## Implementation (Path A)

### 1. Connect the connectors
Link Salesforce, HubSpot, and Zoho CRM via `standard_connectors--connect`. This injects `SALESFORCE_API_KEY`, `HUBSPOT_API_KEY`, `ZOHO_CRM_API_KEY` alongside `LOVABLE_API_KEY` into the server runtime.

### 2. New server functions — `src/lib/crm.functions.ts`
One `createServerFn({ method: "POST" })` per provider (or a single fn with a `provider` arg), each guarded by `requireSupabaseAuth`:
- Calls the provider through the connector gateway (`https://connector-gateway.lovable.dev/{provider}/...`) with `Authorization: Bearer LOVABLE_API_KEY` + `X-Connection-Api-Key`.
- Fetches Accounts/Contacts, Deals/Opportunities, and recent activity (paginated).
- Normalizes each record into ChAi dataset rows (headers + string rows) reusing the shape already produced by `extractRecords` in `ingest.functions.ts`, so downstream review/import code is shared.
- Returns `{ datasets: ExtractedDataset[] }` plus a per-dataset confidence.

### 3. Wire the UI (`src/routes/_authenticated.app.data.tsx`)
- Replace each CRM tile's demo-toast `onClick` with a connect/import flow: trigger the server fn, show a loading state, then a **review step** (reuse the mapping/preview UI pattern from `SmartIngestWizard`) before anything is saved.
- On confirm, write results into `uploads-store` as `UploadRecord`s (same path manual uploads use), so Data Quality, dashboard metrics, and customer lists pick them up automatically.
- Show "Last synced" per CRM, mirroring the existing "Last uploaded on" recency treatment.

### 4. Status & churn alignment
Map CRM lifecycle/renewal state onto the `status` field (`active` / `churned` / `won-back`) using the user's onboarding `churnDefinition`, so imported CRM accounts respect the churn rules already configured.

## Technical notes
- All CRM calls are server-side only (gateway keys never reach the browser).
- Reuse `ExtractedDataset` / `UploadRecord` types — no new data model.
- Validate + cap pagination; back off on 429; surface clear errors on gateway 4xx.
- No DB schema change required for Path A (data flows into the existing in-memory uploads store); if you want CRM imports persisted per user, that's an added `crm_imports` table (say the word).

## Out of scope (unless requested)
- Per-user OAuth (Path B).
- Scheduled/automatic background sync (this plan is on-demand sync from the tile).
