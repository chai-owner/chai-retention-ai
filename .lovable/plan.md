# Plan: realistic homepage demo data (plan only, nothing built yet)

## Where things stand
- The 8 sample customers are made by one seed script. Each has 4–6 invoices a month apart, 0–4 tickets, and no activities.
- Only Meadowbank has 3+ tickets, so ticket measures need 5 qualifying customers and are switched off for everyone. Ticket dates are also missing from the seed.
- The homepage panel is a saved snapshot (Meadowbank 37, "High support volume" from 4 tickets). The page copy doesn't change.

## a) Data to add (all dated, over the last 12 months, with realistic gaps)
Every customer gets 10–12 monthly invoices (small ups and downs, a few paid late) and 4–14 dated tickets, so all 8 pass the 3-record and 5-customer minimums. No activities: the homepage engine uses invoices and tickets only, and activities score only under custom CRM measures, which the demo doesn't have. Adding them would just be noise.

| Customer | Invoices (12 mo) | Tickets | Pattern |
|---|---|---|---|
| Meadowbank Logistics | 10, falling 2,100 → 900, last one about 110 days ago | 12–14, 4 in the last 30 days, 3–4 open/reopened, low CSAT | at risk |
| Tidewater Legal | 11, steady, last about 45 days ago, 2 late | 7, rising lately, 1 open | watch |
| Copperfield Veterinary | 11, slight dip | 6, mixed CSAT | watch |
| Harbour & Finch, Ridgeway, Oakline, Brightside, Northgate | 11–12, steady, last within 30 days | 4–6, closed, good CSAT | healthy |

A second at-risk customer (Tidewater or Copperfield) comes only if their real data supports it. I won't force it.

## b) Expected results (estimates; the real engine decides)
- Meadowbank: about 25–40, "At risk". Likely reasons: High support volume (for example "13 tickets, 4 in the last 30 days"), Unresolved support tickets ("4 of 13 open or reopened"), No recent purchases ("last purchase about 110 days ago") or falling order value. Confidence moves from "moderate" to "high", because it now rests on 10 invoices and 13 dated tickets. Actions stay the same kind: Resolve open support issues, Clear the ticket backlog, Re-engagement campaign, each showing revenue saved.
- Tidewater and Copperfield: about 55–70, watch.
- The other 5: about 80–95, healthy.
- I'll show the real before → after table for all 8 before anything reaches the homepage. If Meadowbank doesn't come out as the clearest at-risk customer, I'll report that and won't adjust scores by hand.

## c) Share image
Yes, re-export social-share-hero.png if it shows the panel's numbers (score, reasons) and they change. I'll check what it shows first. If it only shows copy or branding, it stays as is.

## d) Risks and effort
- The spread may not come out as planned, because the evidence rules are strict. The fix is to adjust the sample data, never the rules.
- The panel's saved snapshot and the live demo page must match. Both will come from the same seed.
- "Sample data" labels stay exactly where they are. No page copy changes.
- Demo-only change: no real accounts or saved scores are touched.
- Effort: small. It's one seed script, a regenerated snapshot, a few tests (all 8 pass the minimums, Meadowbank's reasons match), and possibly one image. Nothing is published until you approve.

## Technical details
- Edit scripts/hero-snapshot/generate.ts: add ticket dates, longer invoice histories and some late payments. Re-run it to rewrite src/lib/hero-snapshot.json with the real engine and the default weights.
- If demo-tables.ts feeds the live demo, update it from the same seed.
- Tests: snapshot values match the engine, and no customer comes out as notEnoughData.
