# Identify customers by name or email, not just customer ID

Right now every metric template ChAi generates from your business profile (and the built-in transactions, usage, support and survey templates) asks for `customer_id` as the only way to say which customer a row belongs to. If your IDs are inconsistent, missing, or differ per platform, those rows land in the unmatched pile even when the row clearly names the customer.

## What changes for the user

1. **Every upload template gains two optional columns**: `customer_name` and `email`, alongside `customer_id`.
2. **At least one identifier is required, not specifically the ID.** A row is accepted if it has any of ID, email, or customer name. The template text says "Provide at least one of customer_id, email or customer_name".
3. **Matching uses whichever identifier is present**, in this order: saved link → exact ID → exact email → email domain + similar company name → similar name. Exact ID and exact email link silently; anything weaker becomes a suggestion in Identity Resolution, as today.
4. **Rows without an ID still work.** When a row matches a known customer by email or name, ChAi attributes it to that customer and remembers the link. When nothing matches, the row appears in Identity Resolution showing the name/email it carried, so you can link it in one click instead of guessing at a bare ID.
5. **Sample CSVs and the AI Data Drop mapping** include the new columns, so downloaded templates and auto-mapped files both accept name/email headers (including common variants like `company`, `account_name`, `contact_email`).

## Technical section

- `src/lib/data-schemas.ts`: add optional `customer_name` and `email` fields to `transactions`, `usage`, `support`, `surveys`; mark `customer_id` as non-mandatory but part of a new `identifierGroup` concept.
- `src/lib/personalize-data.ts` (`buildCustomMetricDatasets`): same three identifier fields on each AI-metric dataset, with updated descriptions and sample rows.
- Add a shared helper (e.g. `hasIdentifier(row)`) used by the upload wizard and smart-ingest validation so "missing customer_id" errors become "no customer identifier" only when all three are absent.
- `src/lib/customer-matching.ts` already reads email and name fields off rows (`EMAIL_FIELDS`, `rowName`); extend the unmatched-grouping key so rows with no `customer_id` group by their email/name instead of being dropped, and surface that label in the Identity Resolution UI.
- `src/lib/real-scoring.ts` / `customer-merge.ts`: resolve a row's customer key through the identity resolver rather than raw `customer_id`, so name/email-only rows contribute to health scores.
- Update `src/lib/personalize-data.test.ts` and `customer-matching.test.ts` for the new fields and the identifier rule.

## Sequencing

1. Schema + template changes (data-schemas, personalize-data, sample rows).
2. Validation rule: at least one identifier.
3. Matching/scoring: resolve by ID, email, or name; group unmatched rows by whatever identifier they carry.
4. Identity Resolution UI labels + tests.
