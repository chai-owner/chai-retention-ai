# Data coverage & freshness flags

Make it obvious, everywhere intelligence is shown, when the assessment is built on missing or stale data — and say plainly that the numbers will change once recent data is added.

## What the user will see

**1. A data confidence banner**
A single strip shown at the top of the Dashboard, Insights and Customers pages when coverage is incomplete or data is old:

- Red/amber "Limited data" — customer list present but one or more signal types (transactions, usage, support, surveys) missing.
- Amber "Data may be out of date" — the newest dated row across all signals is older than 30 days.
- Nothing shown when coverage is complete and data is recent (last 30 days).

The banner lists exactly what's missing/stale ("No usage data. Support data last updated 68 days ago.") and links to Add your data.

**2. Per-metric / per-card flags**
Small "limited data" markers on cards whose underlying dataset is empty or stale, so a healthy-looking number isn't read as fact.

**3. Welcome screen after onboarding**
Both states get a coverage note:

- Enough data: below the insights list, a callout — "This assessment is based on the data available today: X customers, [datasets present]. It is likely to change as you add recent data — [what's missing/stale]."
- Not enough data: the existing warning card gains the same specifics plus the "likely to change" wording.

## Technical approach

- Extend `src/lib/real-scoring.ts`: add a `DataCoverage` result to `assessSufficiency` (or a sibling `assessCoverage`) reporting, per dataset key (customers, transactions, usage, support, surveys, plus each active custom metric): row count, most recent date found in that dataset's date field, days since that date, and a status of `missing` | `stale` | `ok`. Overall `confidence: "low" | "partial" | "good"` and a plain-English `notes: string[]`.
- Date detection reuses the existing date parsing in `real-scoring.ts`, checking the conventional date columns per dataset (`transaction_date`/`occurred_at`/`date`/`submitted_at`).
- Expose via `useRealAssessment` and a new `useDataCoverage()` in `src/lib/use-scored-data.ts` (real ingested rows only; returns "good" in demo mode so the public demo stays clean).
- New presentational component `src/components/data-coverage-banner.tsx`, rendered in `_authenticated.app.dashboard.tsx`, `_authenticated.app.insights.tsx`, `_authenticated.app.customers.index.tsx`.
- `_authenticated.app.welcome.tsx`: render the coverage note in both the snapshot and no-snapshot branches.
- Tests added to `src/lib/real-scoring.test.ts` for missing-dataset, stale-dataset and fully-covered cases.

Staleness threshold: 30 days (configurable constant).
