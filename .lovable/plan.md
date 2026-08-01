## Goal

Yes — a linking wizard is the right fix. When a transaction, usage, support, or survey row carries a `customer_id` that doesn't match any customer record (typos, whitespace/case drift, or different IDs across CRM vs accounting), the row is silently ignored by scoring. The wizard lets the user resolve those rows by searching for a customer by name and linking them.

## Where it lives

A new "Unmatched records" section on the **Data Quality Engine** page, with a "Resolve matches" button that opens the wizard dialog.

## How it works

1. **Detection** — after ingestion, compare each non-customer dataset's `customer_id` against the set of known customer IDs. Group unmatched rows by their raw `customer_id` value so the user resolves one alias at a time, not one row at a time.
2. **Auto-suggestions** — for each unmatched ID, propose likely candidates first:
   - exact match after trim + lowercase (offer a one-click "Fix casing/whitespace" bulk action)
   - fuzzy name/email/domain similarity against customer names
3. **Manual search** — a searchable customer picker (name, ID, or email) for anything not auto-suggested.
4. **Actions per group** — Link to customer / Skip for now / Mark as not a customer (ignore permanently).
5. **Apply** — linking writes an alias mapping so all current and future rows with that raw ID resolve to the chosen `customer_id`. Scores recompute immediately.

```text
Unmatched records (3)
 ├─ "acme-corp-1"   12 transactions   → suggested: Acme Corporation (CUS-1001)  [Link] [Skip]
 ├─ "CUS-1001 "     4 usage rows      → whitespace match: CUS-1001              [Fix]
 └─ "0053k00000X"   7 invoices        → search…                                [Link] [Ignore]
```

## Technical details

- New table `customer_id_aliases` (`user_id`, `source_id`, `customer_id`, `status`: linked | ignored) with RLS scoped to `auth.uid()` plus the required GRANTs.
- Alias resolution applied in `src/lib/real-scoring.ts` where transactions/usage/support/survey rows are grouped by `customer_id`, so a single mapping covers every dataset.
- Detection helper in a new `src/lib/customer-matching.ts` (pure, works on the in-memory `ingestedStore`), so it can also feed a count badge on the Data Quality page.
- Wizard UI as a new component `src/components/customer-link-wizard.tsx` using the existing dialog/command components.
- Ingestion normalizes `customer_id` (trim) going forward so trivial mismatches stop appearing.
- Demo mode shows a sample unmatched group; signed-in accounts with no unmatched rows show a clean "All records matched" state.

## Not included

No automatic cross-provider identity merging (e.g. Salesforce vs QuickBooks IDs for the same company) beyond the suggestion list — the user always confirms the link.
