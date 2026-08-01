## Goal

Stand up an automated test suite so every core ChAi feature — and every integration's plumbing — is verified on each change, without needing live provider accounts.

## Current state

The project has no test runner installed (no `vitest`, no test files, no `test` script in `package.json`). Everything is verified by hand today.

## What to set up

**Test infrastructure**
- Add `vitest`, `@vitest/coverage-v8`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` as dev dependencies.
- Add `vitest.config.ts` (jsdom environment, `@/` path alias via `vite-tsconfig-paths`, setup file) and a `test` / `test:watch` script.
- Add `src/test/setup.ts` with jest-dom matchers and a shared Supabase client mock so nothing hits the real backend.
- Add `src/test/fixtures.ts` with reusable sample profiles, ingested rows, and provider API payloads.

**Tier 1 — Business logic (pure functions, highest value)**
- Health scoring: weighted blend of AI-generated metrics, weight 0 removes a metric, missing metrics default to 3, deterministic output.
- Revenue at risk vs. retention opportunity formulas produce consistent, in-range numbers.
- Data sufficiency assessment: "not enough data" thresholds behave as specified.
- Customer matching and aliases: fuzzy candidate ranking, alias application to all dataset types, saved-link usage counts.
- Personalized dataset schemas: one upload schema generated per AI-selected metric.
- Demo-mode rules: signed-in users never receive sample data, regardless of `?demo=1`.

**Tier 2 — Ingest and parsing**
- Spreadsheet/CSV parsing and column mapping into normalized datasets.
- Batch persistence shape (upsert keys prevent duplicate rows on re-sync).
- Bad input handling: empty file, missing `customer_id`, malformed dates.

**Tier 3 — Integrations, mocked at the network boundary**
Since there are no test accounts, each provider is tested with `fetch` stubbed to return recorded-shape payloads. Per provider (QuickBooks, Xero, FreshBooks, Salesforce, HubSpot, Zoho CRM, Zendesk, Intercom, Freshdesk):
- Normalizer maps a realistic provider payload into ChAi's customer/transaction/support datasets.
- Incremental sync passes the `last_synced_at` cursor into the provider query and updates it after a run.
- Token expiry triggers refresh; refresh failure surfaces a clean error rather than crashing.
- OAuth callback routes: invalid state rejected, provider error param redirects with an error, happy path saves a connection.
- A config test asserts every provider listed in the integrations UI has matching client-id/secret env names and a callback route, so a half-wired integration fails the suite.

**Tier 4 — Auth and access rules**
- `requireSupabaseAuth`-protected server functions reject calls without a bearer token.
- Cron endpoint `/api/public/hooks/daily-sync` returns 401 without the correct `x-cron-secret` and 200 with it.
- Admin-only server functions reject non-admin users.

**Tier 5 — Light UI smoke tests**
- Onboarding metric step: cannot delete below 4 metrics.
- Upload panel: dropdown lists the user's selected metrics.
- Dashboard renders empty-state (no fabricated data) for a signed-in user with zero rows.

## Delivery order

1. Infrastructure + fixtures, plus Tier 1 (scoring/matching) — the highest-risk logic.
2. Tier 2 ingest and Tier 4 auth/cron guards.
3. Tier 3 integration normalizers and OAuth callbacks, one provider at a time.
4. Tier 5 UI smoke tests.

## Notes

- No live provider calls; everything is mocked, so the suite runs offline and deterministically.
- When you do get sandbox accounts later, we can add a separate opt-in "live" suite that runs one real connect + sync per provider.
- I'll run the suite and report any real bugs it uncovers rather than editing the tests to pass.
