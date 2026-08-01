## Context

Matching is already permanent. When you link an unrecognised ID to a customer, the mapping is stored in your account's database, reloaded on every sign-in, and applied to all data — including newly uploaded files and daily integration refreshes — before health scores are calculated. The same ID never returns to the matching wizard.

What's missing is a way to see and manage that memory.

## What to build

A **Saved links** card on the Data Quality Engine page, placed directly under the "Unmatched records" card.

For each remembered mapping, show:
- the raw incoming ID (e.g. `ACME-CORP-01`)
- an arrow to the customer it resolves to, by name
- how many rows in the current data that link is currently resolving, broken down by dataset (transactions, usage, support, etc.)
- for entries marked "Not a customer", an "Ignored" badge instead of a target customer

Actions per row:
- **Unlink** — removes the mapping; the ID returns to the unmatched list on the next check
- **Change** — reopens the linking wizard for that single ID so a different customer can be chosen

Empty state: "No saved links yet. Matches you confirm are remembered and applied automatically to future uploads and syncs."

A short line at the top of the card makes the behaviour explicit: links are remembered permanently and applied to new data automatically.

In demo mode the card shows a couple of illustrative saved links, consistent with the other demo content on the page.

## Technical notes

- Read from the existing `useCustomerAliases()` store; no new database work — `customer_id_aliases` already holds these rows with the right access rules.
- Row counts come from a small helper next to `findUnmatched` in `src/lib/customer-matching.ts` that counts occurrences of each alias `source_id` across the raw (pre-alias) ingested datasets.
- Unlink uses the existing `unlinkSourceId()`; "Change" reuses `customer-link-wizard.tsx` seeded with a single group.
- Customer names resolve via the existing `customerOptions()`; if a linked target no longer exists in the roster, show the raw id with a "customer not found" note.
