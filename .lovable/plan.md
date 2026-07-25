## Goal

Replace the current per-dataset upload list with a single unified upload point where the user picks the dataset/metric from a dropdown, then sees the recommended template and an upload area.

## Changes

**`src/components/data-uploads-panel.tsx` — rewrite `UploadDatasetsCard`:**
- Remove the list of `DatasetRow`s.
- Show one card with:
  1. A `Select` dropdown labelled "What are you uploading?" listing every personalized dataset (the standard ones plus the AI-generated "Your ChAi metrics" dataset when present).
  2. Once a dataset is selected, show a panel with:
     - Dataset description.
     - Recommended template summary: required and optional columns rendered as the same field chips used today, plus a "Download CSV template" and "Download Excel template" link (reusing the same template helpers the current wizard exposes; if only CSV exists today, keep CSV only).
     - "Last uploaded on <date>" if applicable, with the same recency color logic.
     - An "Upload file" button that opens the existing `UploadWizard` for that dataset.
- Preserve existing behavior: personalization via `personalizeDatasets`, custom-metrics dataset via `buildCustomMetricsDataset`, upload history via `useUploads`.

**No changes** to `UploadWizard`, dataset schemas, personalize logic, or the `SmartIngestCard`. Business logic and ingestion pipeline stay identical.

## Out of scope

- Changing what datasets exist or their fields.
- Changing the wizard flow after a file is chosen.
- Any backend changes.
