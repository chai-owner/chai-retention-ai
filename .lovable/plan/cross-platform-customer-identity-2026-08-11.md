# Cross-platform customer identity

Today ChAi matches every incoming row to a customer by a single `customer_id` value, with manual links saved in the alias list (one saved link per raw ID, per account). That works when a mismatched ID is unique, but it breaks when platforms use their own ID spaces: Zendesk user `4471`, Xero contact `c1f2-…` and your CRM's `ACME-01` are the same company, and two platforms can even reuse the same raw number for different customers.

The fix is to treat each customer as one master record with many platform identities.

## What changes for the user

1. **Master customer record.** Every customer gets one ChAi identity. Each connected platform's ID becomes an identity attached to it, instead of a competing customer.
2. **Automatic matching first.** When data arrives from a platform, ChAi tries, in order:
   - a saved link for that platform's ID (instant, silent),
   - exact email match on the contact,
   - email-domain + company-name match,
   - normalized name match (case, punctuation, "Ltd/Inc/(Pty)" ignored).
   Confident matches link automatically; anything weaker becomes a suggestion.
3. **Review queue in Data Quality.** Unresolved rows are grouped per platform and show suggested customers with the reason ("same email", "name 92% match"). One click links; links are permanent.
4. **Customer profile shows its identities.** Each customer detail page lists the connected IDs — Zendesk #4471, Xero c1f2…, CSV `ACME-01` — with the option to unlink a wrong one.
5. **Saved links become platform-aware.** The saved-links list gains a source column, so "4471 from Zendesk" and "4471 from Xero" never collide.

## Behaviour rules

- A platform ID can belong to only one master customer; linking it elsewhere moves it and re-attributes historic rows.
- Rows whose ID is deliberately ignored stay ignored per platform, not globally.
- Auto-matching only merges on an exact email match; name/domain similarity always asks first, so two similarly named customers are never silently merged.
- Metrics, health scores and revenue roll up to the master record, so one customer stops appearing three times.

## Technical section

- Extend `public.customer_id_aliases` with a `source` column (`zendesk`, `xero`, `quickbooks`, `hubspot`, `csv`, …) and change the unique key from `(user_id, source_id)` to `(user_id, source, source_id)`; existing rows backfill as `source = 'unknown'` and continue to resolve.
- Tag ingested rows with their provider at write time: `ingest_batches.source_provider` already carries it, so `applyAliases` and the mismatch detector in `src/lib/customer-matching.ts` take a `source` argument and key their maps on `source + ':' + id`.
- Add an identity-resolution pass in `src/lib/customer-matching.ts`: exact email → auto-link; email domain + fuzzy company name, or fuzzy name alone → scored suggestion with a human-readable reason. Reuse the existing `similarity()` helper; keep the auto-link threshold at exact-email only.
- The link wizard (`src/components/customer-link-wizard.tsx`) and Data Quality saved-links list gain the source label and an unlink action; the customer detail route gains a "Connected identities" block.
- No change to the sync cadence — resolution runs after each daily incremental pull, so a newly linked ID retro-applies to previously stored rows.

## Sequencing

1. Migration: add `source`, swap the unique constraint, backfill.
2. Matching engine: source-aware aliases + email/name resolution with reasons.
3. UI: Data Quality review queue and saved links with source, customer detail identities panel.
4. Wire the connectors' provider tag through ingest so every new row resolves automatically.
