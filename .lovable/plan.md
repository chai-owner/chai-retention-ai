# Smart Data Ingestion (AI) — Paid Add-on

Let users drop in messy, real-world files — scanned invoices, PDFs, exported spreadsheets, photos of receipts, plain text — and have ChAi's AI read them, pull out the relevant customer/transaction/usage data, show the user exactly what it found, and (after confirmation) update the right ChAi datasets. Gated behind a premium add-on with upgrade UI.

## How it works (user flow)

```text
Upload any file  ─▶  AI reads & extracts  ─▶  Review overlay  ─▶  Confirm
(pdf/img/xlsx/csv/txt)   (maps to ChAi datasets)  (edit/fix rows)   (save to stores)
```

1. On the Data Uploads page, a new **"Smart Ingestion (AI)"** card sits above the structured-upload list.
2. If the add-on is not enabled, the card shows a locked/upgrade state with pricing and an "Enable add-on" button (UI gating only — flips a local flag, no billing).
3. When enabled, the user drops in any supported file. The file is sent to a server function that uses the AI Gateway to:
   - Identify the document type (invoice, customer list, usage export, support log, etc.).
   - Extract rows and map them to one or more ChAi datasets (`customers`, `transactions`, `usage`, `support`, `surveys`).
   - Return structured records + a confidence note + which dataset each batch targets.
4. A **review overlay** (reusing the existing wizard pattern) shows the extracted records grouped by target dataset, with the same date/number/email/mandatory validation already in `upload-wizard.tsx`. The user can edit cells, fix mappings, or drop rows.
5. On **Confirm**, clean records are written to `uploadsStore` (one `UploadRecord` per dataset detected), so they flow into Data Quality, the dashboard, etc. Nothing saves until clean + confirmed.

## What gets built

**New server function — `src/lib/ingest.functions.ts`**
- `extractRecords` (`createServerFn`, POST) using the AI Gateway provider (same helper as `ai.functions.ts`).
- Accepts a base64 file + mime type + the target dataset schemas (field names/types/mandatory) so the model knows what to map to.
- Uses multimodal content blocks: `file` block for PDFs, `image_url` for scanned invoices/photos. Spreadsheet/CSV/text are parsed to text first and sent as text.
- Returns JSON: `{ documentType, datasets: [{ key, headers, rows, confidence, note }] }`. Prompt-for-JSON + parse (schemas are dynamic/large, so avoid the constrained-output state limit).
- Model: `google/gemini-3-flash-preview` (multimodal, cost-efficient).

**File handling**
- PDF / images (jpg, png, webp): sent directly to the model as multimodal blocks.
- CSV / TXT: parsed client-side (reuse existing `parseCsv`) and sent as text.
- XLSX / XLS: parsed with SheetJS (`xlsx`, pure-JS, Worker-safe) to rows, sent as text.
- Word / Google Docs / Google Sheets: show inline guidance to export as PDF/CSV/XLSX (native .docx parsing isn't reliable on the edge runtime). This keeps the feature honest about what it can read today.

**New component — `src/components/smart-ingest-wizard.tsx`**
- Step 1: drop any supported file → calls `extractRecords`, shows a loading state.
- Step 2: review overlay — extracted records grouped per detected dataset, editable, with the existing validation logic and error table. Confirm writes `UploadRecord`s via `uploadsStore.add`.

**Add-on gating — `src/lib/addons-store.ts`** (new, `useSyncExternalStore` like `uploads-store`)
- `smartIngest: boolean` flag, default off. `enable()` / `disable()`.
- The card reads it to toggle locked vs. active state. (UI only; ready to wire to real payments later.)

**Data page — `src/routes/_authenticated.app.data.tsx`**
- Add the Smart Ingestion card (locked state with price + benefits, or active dropzone) above "What to upload for your business".

## Recommended pricing

This add-on's real cost is AI vision/document tokens, which scale with pages processed. Recommendation:

- **$49 / month**, including **up to ~250 document pages/month** of AI extraction.
- **Top-up: $0.20 / page** beyond the included allowance (or a +100-page bundle for $15).
- Position it as an add-on to the base ChAi subscription, consistent with the credit/allowance model discussed earlier for AI features.

Rationale: at typical multimodal rates a page of invoice/PDF extraction is a few cents of model cost; $49 with a 250-page cap keeps a healthy margin while staying approachable for SMBs, and per-page top-ups keep heavy users cost-aligned. The page allowance (not raw "credits") is easy for a non-technical buyer to reason about. I can adjust the number/allowance if you have a target margin or competitor benchmark in mind.

## Technical notes

- Reuses the existing AI Gateway helper (`ai-gateway.server.ts`) and the `createServerFn` pattern already in `ai.functions.ts`; no new secrets (`LOVABLE_API_KEY` already set).
- `xlsx` added via `bun add xlsx`.
- Extraction prompt passes the dataset schemas dynamically and asks for plain JSON (parsed in code), avoiding constrained-decoding limits.
- Validation/errors reuse the logic in `upload-wizard.tsx` (date `YYYY-MM-DD`, numeric, email, mandatory) so behavior is consistent across both upload paths.
- Surfaces 429 (rate limit) and 402 (credits) gateway errors as clear toasts.

## Out of scope (this build)
- Real billing/checkout for the add-on (UI gating only).
- Native .docx/Google-native parsing (export-to-PDF/CSV guidance instead).
- Persisting uploads to the database (continues using the in-memory `uploadsStore`, like the rest of the demo).