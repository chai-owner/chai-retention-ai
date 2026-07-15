
# Persist all ingested data to the backend

**Recommendation:** do this. Chai can't score, trend, or reason about customers that disappear on refresh. Right now every upload, CRM sync, and accounting sync lands in a JS variable (`ingestedStore`) and is gone the next page load — only accounting OAuth tokens are actually saved. This plan moves all user-brought data into the database, scoped per user, with a batch history so you can see *what* arrived *when* and *from where*.

## Data model (new tables in `public`)

```text
ingest_batches            one row per upload / sync run
  id, user_id, source_kind ('upload' | 'crm' | 'accounting' | 'drop'),
  source_provider (e.g. 'salesforce', 'quickbooks', 'csv'),
  dataset_key ('customers' | 'transactions' | 'support' | 'usage' | 'surveys'),
  filename, row_count, status, error, created_at

ingested_customers        dedup on (user_id, customer_id)
  id, user_id, customer_id, batch_id, data jsonb, created_at, updated_at

ingested_transactions     dedup on (user_id, transaction_id)
  id, user_id, transaction_id, batch_id, customer_id, data jsonb,
  amount, occurred_at, created_at

ingested_support          dedup on (user_id, ticket_id)
  id, user_id, ticket_id, batch_id, customer_id, data jsonb, created_at

ingested_usage            append-only
  id, user_id, batch_id, customer_id, data jsonb, occurred_at, created_at

ingested_surveys          append-only
  id, user_id, batch_id, customer_id, data jsonb, submitted_at, created_at
```

- Full incoming row kept as `jsonb` so nothing outside the current narrow shape is silently dropped.
- Promoted columns (`customer_id`, `amount`, `occurred_at`) power scoring queries without JSON parsing.
- Every table: `GRANT` to `authenticated` + `service_role`, RLS on, policies scoped to `auth.uid() = user_id`. No `anon`.
- Indexes on `(user_id, dataset)` and `batch_id`.

## Server functions (`src/lib/ingest.functions.ts`)

- `saveIngestBatch({ source, provider, dataset, rows, filename? })` — auth-gated; creates a batch row and upserts data rows.
- `listIngestBatches()` — batch history for Data Quality + Integrations panels.
- `listIngestedRows({ dataset })` — replaces the client `ingestedStore` reads.
- `deleteIngestBatch({ id })` — removes a batch and its rows.

All use `requireSupabaseAuth`; RLS enforces per-user isolation.

## Client rewiring

- `ingestedStore` becomes a thin TanStack Query-backed cache reading from `listIngestedRows`. Refresh no longer clears data.
- Wizards (`upload-wizard`, `smart-ingest-wizard`, `crm-sync-wizard`, `accounting-sync-wizard`) call `saveIngestBatch` instead of `ingestedStore.addRows`.
- `uploads-store` (upload metadata) is replaced by `listIngestBatches`, so Data Quality history survives refresh too.
- Dashboard / Customers / Churned / Customer detail keep their selectors, just reading from the query-backed store.
- On sign-out, invalidate queries so nothing leaks across users.

## Out of scope

- `tickets-store`, `churn-store`, `addons-store`, `profile-store` — UI/preference state, leave in-memory for now.
- Demo mock data stays client-only; real ingests go to DB.
- Team/org sharing — everything per-user until roles are expanded.

## Technical notes

- Chunked upserts (~500 rows/insert) with `onConflict: 'user_id,customer_id'` etc. so re-syncs dedupe the same way today's store does.
- CRM/accounting server functions write directly with `context.supabase` instead of returning the dataset to the browser; response becomes `{ batchId, counts }`.
- File uploads still parse CSV/XLSX in the browser, then POST parsed rows to `saveIngestBatch`.

## Rollout order

1. Migration: 6 tables + GRANTs + RLS + indexes + `updated_at` trigger.
2. Add `ingest.functions.ts` server functions.
3. Switch CRM + accounting sync flows to write to DB.
4. Switch upload + smart-drop wizards to write to DB.
5. Replace `ingestedStore` reads with query-backed selectors.
6. Replace `uploads-store` with the batch-history query.
