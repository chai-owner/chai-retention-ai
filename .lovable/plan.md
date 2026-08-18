# Fix: Data Drop only imports the first customer from a CSV

## What's happening

When you drop a CSV, the whole file is handed to the AI and the AI is asked to
type out every extracted row back as JSON. For a spreadsheet with many rows the
model summarises instead — it returns one or two example rows (usually the first
customer) and stops. Long files are also cut off at 60,000 characters before the
AI ever sees them. So the import is capped by what the model chooses to re-type,
not by what's in your file.

## The fix

Treat already-structured files (CSV, XLSX, XLS, TXT tables) differently from
unstructured ones (PDF, scans, images).

**Structured files — AI maps, ChAi imports**

1. Parse the file in the browser as it does today, so ChAi holds every row.
2. Send only the header row plus a small sample (first ~20 rows) to the AI.
3. The AI returns a *mapping*, not data: which dataset(s) the file feeds, and
   which spreadsheet column supplies each dataset field — including derived
   cases (e.g. a "no-show" column feeding a missed-appointment metric) and
   which column carries the customer identifier.
4. ChAi applies that mapping locally to **all** rows. Row count is then exactly
   the file's row count, every time.

**Unstructured files (PDF/image)** keep today's AI row extraction, with two
guards: the model is told to return every row it can see and never truncate,
and multi-page documents are processed page-batch by page-batch and merged.

**Visibility**

- The review screen shows "X of Y rows in the file" so any shortfall is obvious
  before importing.
- Preview table stays capped (first 50 rows) with a "+ N more rows" line, so a
  large file still imports in full without a huge on-screen table.

## Technical notes

- `src/lib/ingest.functions.ts`: add a `mapColumns` server function (header +
  sample in, dataset/field→column mapping out, with confidence and note).
  Keep `extractRecords` for PDFs/images; strengthen its prompt against
  truncation and raise the text cap.
- `src/components/smart-ingest-wizard.tsx`: for `.csv/.txt/.xlsx/.xls`, parse
  locally (existing `parseCsv` / `XLSX.utils.sheet_to_csv`), call `mapColumns`,
  then build dataset rows from every parsed row; unchanged path for other types.
- Multi-file merge, per-field validation, source tagging (`drop`) and the
  existing persistence/identity-resolution flow stay as they are.
- Add a unit test covering a 200-row CSV mapped through to 200 imported rows.

No changes to your metrics, schemas, or the rest of the ingestion pipeline.
