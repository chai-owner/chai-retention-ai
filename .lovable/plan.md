# Combine customer matches into one section

## How it will look

Keep **Unmatched records** and **Possible duplicate customers** unchanged. Replace the two overlapping sections with one:

```text
Matched customers from different sources (2)
Records from other platforms that ChAi always links to the same customer,
on every sync and upload.

Acme Corporation                              View profile
  Xero       ACME-CORP-01
  Currently resolving 34 transactions · 9 usage rows   Change  Unlink

Northwind Labs                               View profile
  Zendesk    northwind labs
  Currently resolving 11 support tickets                Change  Unlink

Matches not linked to any current customer
  Zoho CRM   SN-0030 · customer not found
  No rows in your current data use this reference       Change  Unlink

Ignored records
  HubSpot    INTERNAL-TEST · Ignored — not a customer
  Currently resolving 3 transactions                    Change  Unlink
```

Each current customer gets one card. Every saved platform record becomes a row inside that card, retaining its source, reference, current-row status, **Change**, and **Unlink** controls. **View profile** remains at customer level.

The number in the section title will count current customer cards, not individual rules. The empty message remains **“No matched customers yet.”** when there are no current-customer cards.

## Orphaned and ignored matches

- Saved matches whose customer has disappeared go in **Matches not linked to any current customer** at the bottom of the same section. They remain visible and keep **Change** and **Unlink**, so they can be repaired or removed.
- Saved “Ignored — not a customer” rules go in a separate **Ignored records** group immediately below. This preserves information currently shown in Saved Customer Matches without presenting ignored records as customers.
- Either group is hidden when empty.

## Wording updates

Update references that currently describe two separate sections:

- **Identity Resolution page description:** remove “saved customer matches” so it lists unmatched references, duplicates, and matched customers.
- **Data Quality page:** change “Unmatched records, saved customer matches, duplicate customers and matched customers…” to “Unmatched records, duplicate customers and matched customers…”.
- **Help article:** replace “use Saved Customer Matches or Matched customers from different sources” with “use Matched customers from different sources”.
- **Demo notice:** replace “Saved customer matches can be managed…” with “Customer matches can be managed…”.

No navigation links point directly to either old section; links go to the Identity Resolution page itself. Customer-page wording, erasure-report wording, and internal comments remain unchanged.

## Behaviour and checks

- Reuse the existing saved matches, row counts, matching wizard, unlink action, and profile links; no matching or scoring rules change.
- Partition saved rules into current-customer, missing-customer, and ignored groups without dropping any entry.
- Add focused tests covering grouping, orphan visibility, ignored-rule visibility, row counts, and unchanged Change/Unlink inputs.
- Check the combined section at desktop and mobile sizes, then confirm the project is clean. Do not publish.

## Risks and effort

- **Main risk:** accidentally hiding missing-customer or ignored rules while regrouping. Explicit groups and tests prevent this.
- **Small display risk:** customers with many platform records create taller cards; rows will wrap on narrow screens without changing controls.
- **Effort:** small, about half a day including tests and visual checks. No data migration or backend work is needed.
