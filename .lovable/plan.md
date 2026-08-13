# Make ChAi's nominated metrics show up everywhere data is requested

Short answer: partly, yes — the manual upload section already builds one upload option per metric ChAi nominated during onboarding (verified in `data-uploads-panel.tsx`, which merges `buildCustomMetricDatasets(profile.metrics)` into the dropdown). But the AI Data Drop and the integration sync wizards only know about the five fixed datasets (customers, transactions, usage, support, surveys), and the metric datasets are never flagged as required. So the metrics aren't consistently reflected.

## What to change

1. **Data Drop understands your metrics**
   The AI extraction step is told only about the five generic datasets, so a spreadsheet containing a nominated metric (for example "onboarding completion") gets ignored or crammed into the wrong table. Pass the metric-derived dataset definitions into the extraction call and into the review/edit step so the Data Drop can recognise and map those columns.

2. **Sync wizards recognise metric datasets**
   The CRM and accounting sync previews resolve incoming datasets against the fixed list only; extend them to the same combined list so a synced field that maps to a nominated metric is displayed instead of silently dropped.

3. **Metric datasets are marked required**
   Metrics ChAi nominated and the user kept (with a non-zero weight) are what the health score is built from, so their upload options should be shown as required, with the reason "ChAi picked this metric for your business" and included in the readiness/coverage counts on the Data page. Metrics the user set to 0 weight stay optional.

4. **Template downloads stay consistent**
   The per-metric CSV/Excel templates already generate from the same schema builder, so they pick this up automatically — verify a metric template downloads with the right column name.

## Technical notes

- Central helper: a single `useAllDatasets()`-style source combining `datasetSchemas` with `buildCustomMetricDatasets(profile?.metrics)`, then `personalizeDatasets(...)`. `data-uploads-panel.tsx`, `smart-ingest-wizard.tsx`, `crm-sync-wizard.tsx` and `accounting-sync-wizard.tsx` all consume it instead of importing `datasetSchemas` directly.
- `personalizeDatasets` gains a rule: keys starting with `metric_` are required when their metric weight > 0, with a reason string.
- Column naming stays with `customMetricKeys` / `metricColumnName` so `real-scoring.ts` keeps finding the rows.
- No schema or migration changes: metric rows already persist via the existing ingested datasets path.
