# Data Drop: calculate metrics from raw data

Today the Data Drop can only copy a spreadsheet column straight into a metric.
If a metric needs working out first — "missed appointments per customer",
"days since last order", "% of tickets reopened" — the file usually has the raw
events, not the answer, so the metric comes back empty.

## What changes

The Data Drop gains a calculation step. When ChAi maps a file, it can now say
either "this column IS the metric" (as today) or "this metric has to be worked
out from these columns, like this". ChAi then does the calculation locally over
every row in the file, so nothing is truncated and the maths is exact and
repeatable.

Two kinds of calculation are supported, covering the realistic cases:

**Per-row calculations** — one output row per file row:
- arithmetic between numeric columns (`revenue / orders`, `a - b`, `a * b`)
- days between two date columns, or days between a date column and today
- yes/no style columns turned into 1/0 (e.g. "No-show" / "DNA" / "TRUE")
- a fixed lookup (e.g. status text → score) when the column has few values
- percentage/currency clean-up (already handled) and unit conversion

**Per-customer roll-ups** — the file has many event rows per customer and the
metric is one number per customer:
- count of rows (optionally only rows matching a condition, e.g. status =
  "no-show") → missed appointments, repeat orders, tickets raised
- sum / average / min / max of a numeric column → average order value, total spend
- most recent date in a group, or days since that date → recency metrics
- share of rows matching a condition, as a percentage → reopen rate, no-show rate

The measurement date for a rolled-up metric is the latest date seen for that
customer, or the file/report date if the file states one.

Any metric generated during onboarding is eligible: ChAi already knows each
metric's meaning, unit and description, so it decides per file whether a direct
column exists, a calculation is possible, or the file simply doesn't contain it.
Metrics it can't derive are left alone rather than guessed.

## What the user sees

On the Data Drop review screen, each mapped dataset shows how it was produced —
"taken from column *Total*" or "calculated: count of rows where *Status* =
No-show, per customer". Calculated ones carry a "Calculated" badge and a
confidence, and the preview shows the resulting values so a wrong assumption is
visible before importing. Row counts continue to state "X of Y rows in file"
(for roll-ups: "Y rows → X customers").

## Technical notes

- `src/lib/ingest.functions.ts` (`mapColumns`): extend the returned mapping
  shape so a field can carry a `derive` spec instead of a plain `column` —
  `{ op, args }` from a fixed, closed operation list (`arith`, `date_diff`,
  `days_since`, `bool`, `lookup`, plus group ops `count`, `count_if`, `sum`,
  `avg`, `min`, `max`, `last_date`, `days_since_last`, `ratio_if`). A dataset
  mapping can also carry `groupBy` (identifier column) to switch it to
  roll-up mode. The prompt is extended with the operation list, worked examples,
  and an instruction to prefer a direct column when one exists. No free-form
  formula strings are executed — only the enumerated ops, evaluated by ChAi's
  own code.
- `src/lib/ingest-mapping.ts`: add a pure evaluator — `evalRowOp` for per-row
  ops and a grouping pass for roll-up mappings — and wire it into
  `applyMapping`, which keeps its current behaviour for plain column mappings.
  Existing normalisation (`normalizeDate` / `normalizeNumber`) is reused for
  inputs and outputs.
- `src/components/smart-ingest-wizard.tsx`: pass the derivation description
  through to the review step and render the provenance line + "Calculated"
  badge; row-count line accounts for roll-ups.
- `src/lib/ingest-mapping.test.ts`: unit tests for each operation, plus an
  end-to-end case (appointment file with a no-show column → per-customer
  missed-appointment counts) and a regression test that plain column mappings
  are unchanged.
- No database, schema, or scoring changes: derived metrics land in the same
  `metric_*` datasets the upload path already writes.
