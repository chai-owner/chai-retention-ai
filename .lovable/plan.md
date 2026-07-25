# Include AI-selected metrics in Customer Health (weighted by user)

Today the health score already blends AI metrics on the **demo/mock path** (`weightedHealth` in `src/lib/mock-data.ts` scores whatever metrics are in the weights map). But on the **real-data path** (`buildRealDataset` in `src/lib/real-scoring.ts`) the loop only considers the built-in `METRIC_NAMES` — any AI-suggested metric the user kept during onboarding is silently dropped, even if they've uploaded values for it. AI-metric importance sliders set during onboarding (`profile.metricWeights`) also need to reach the real-data scorer.

## What changes

1. **Read per-metric uploads.** When the user uploads a custom metric via the manual-upload dropdown, rows land in `ingestedStore` under key `metric_<column>` with fields `customer_id`, `date`, `<column>` (already produced by `buildCustomMetricDatasets`). `buildRealDataset` will scan every `metric_*` dataset present in `IngestedData`.

2. **Compute a per-customer sub-score per custom metric.**
   - Take the most recent value per `customer_id` (by `date`).
   - Normalize to 0–100 using the metric's own `valueAt0` / `valueAt100` from `profile.metrics`. Linear map, clamped. If `valueAt100 < valueAt0`, invert so "lower is better" metrics still map high values → low score.
   - If a metric has no `valueAt0/100`, fall back to relative scoring against the max across customers.

3. **Honor the user's per-metric weight.** Every metric — built-in or AI-suggested — is blended into the weighted average using the importance the user set:
   - Onboarding writes both `profile.metricWeights` (importance 1–5) and `profile.metrics` (definitions).
   - `useActiveMetrics` / `use-scored-data.ts` will merge both maps so the weight object passed to `buildRealDataset` and `scoreCustomers` covers built-in + AI metric names with the user's chosen values (default 3 when unset, 0 = excluded).
   - `buildRealDataset` iterates `[...METRIC_NAMES, ...customMetricNames]`, pulls `weights[name]`, skips when weight ≤ 0, and computes `Σ(score × weight) / Σ(weight)` exactly like the mock path.
   - Result: raising an AI metric's importance to 5 increases its pull on health; dropping it to 0 removes it entirely, matching how built-in metrics already behave.

4. **Surface custom-metric factors.** In `buildFactors`, when a custom metric's sub-score is low (< 50), emit `{ label: metric.name, weight: 100 - score, detail: "Below the healthy range for <metric>." }` so the customer drawer explains the drag on health. No new recommendation copy — custom metrics won't map into `REC_FOR`, which is fine.

## Technical details

- Files touched:
  - `src/lib/real-scoring.ts` — add `collectCustomMetrics(data, profile)`; extend sub-score map, weighted-average loop, and `buildFactors` to include custom metrics.
  - `src/lib/use-scored-data.ts` (and `useActiveMetrics` if it filters) — build a unified weights map from `profile.metricWeights` covering both `METRIC_NAMES` and `profile.metrics[].name` before passing to the scorers.
  - No schema/migration changes. No UI changes — onboarding importance sliders, upload dropdown, and drawer already exist.

- Mock path is unchanged: `weightedHealth` already handles arbitrary metric names and weights.

- Edge cases:
  - Metric renamed → matched by sanitized column name (stable per name); rename produces a new dataset key, old rows become orphaned (matches current behavior).
  - Metric deleted in onboarding → its weight and dataset are ignored.
  - AI metric present but no uploads → doesn't contribute for that customer (same rule as today's built-ins).

## Out of scope

- Backfilling custom metrics from CRM/support integrations.
- Anonymization changes.
- Custom-metric-specific recommendation copy.
