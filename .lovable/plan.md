# Refresh dashboard AI summaries when new data is uploaded

## Goal
Today the dashboard's "Needs attention now" AI one-liners regenerate at most once every 24 hours (or when the set of at-risk accounts changes). Add a third trigger: regenerate immediately when new relevant data is uploaded.

## How it works
The 24h cache (`src/lib/risk-summary-cache.ts`) already keys its stored summaries by a string. We extend that key to also encode an "uploads signature", so any new upload invalidates the cache and forces one fresh AI call.

## Changes

### `src/routes/_authenticated.app.dashboard.tsx`
- Derive an `uploadsSignature` from the existing `uploads` (already available via `useUploads()`): combine the upload count plus the most recent upload's `id` + `uploadedAt`. Any new upload changes this string.
- Fold that signature into the existing `riskKey` (e.g. `` `${riskKey}|${uploadsSignature}` ``) used for both the cache read and write in the summary `useEffect`.
- Result: when a user uploads data, the cache key no longer matches → AI regenerates once and the new result is cached again (still capped at once per 24h for an unchanged dataset).

### No change needed elsewhere
- `risk-summary-cache.ts` already compares the stored key to the requested key, so passing a new key automatically misses the cache and triggers regeneration. No store or schema changes.

## Notes / scope decision
- "Relevant data" = any upload, since every dataset (customers, transactions, support) feeds the health scoring that the summaries describe. If you'd rather scope it to specific dataset types only, say so and I'll narrow the signature to those `datasetKey`s.
- Uploads are currently in-memory (reset on full reload), so this triggers within a session; the 24h cache persists in localStorage across reloads as before.
