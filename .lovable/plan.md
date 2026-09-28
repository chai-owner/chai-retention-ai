# Evidence thresholds: stop thin data from producing extreme scores

Scoping only. Nothing gets built until this plan is approved. The numbers below come from comparisons already run today. Step 1 of the build re-checks every account read-only before any code changes.

## The rules (your proposal, with two small changes)

1. **Per customer, per measure: at least 3 records.** A customer isn't scored on a measure until they have at least 3 dated records of that kind. This is the same minimum that confidence and the own-history comparison already use. Below that, the measure is left out for that customer.
   - **Change:** measures that aren't counts of records work differently. Examples are "days since last purchase" and a single stored field like plan tier or seats. For these, 1 record is real evidence, so the minimum shouldn't apply. The rule applies to counts, averages, sums and rates, not to recency or single-value fields.
2. **Per measure: at least 5 customers.** A comparison between customers needs at least 5 customers who each passed rule 1. This replaces the separate deal and ticket rules with one general rule.
3. **Soften small spreads instead of stretching them.** Today the lowest customer gets 0 and the highest gets 100, however small the gap between them. The new rule:
   - Score each customer by how far they sit from the middle customer (the median), measured against how much customers usually differ from each other.
   - Cap the result so that a small gap moves the score only a little away from 50.
   - Example: 3 open tickets vs 4 would land around 45–55, not 0 vs 100.
   - **Change:** this applies to both screens, not just the nightly score, so they stop disagreeing (King: 53 vs 75).

## 1. Where the rules live

- One new shared module for evidence rules, next to the shared direction module. It holds the 3-record minimum, the 5-customer minimum and the softened spread.
- Both the customer page and the nightly score call it, the same way they now share the direction rule.
- The existing deal and ticket minimums move into it, so there's one rule instead of three copies.

## 2. What would change today (estimates, confirmed in build step 1)

- **SecureNest, ticket measure:** already switched off by the 5-customer ticket minimum, so no change. Vertex, BrightPath and Maple Works stay as they are now.
- **SecureNest, invoice customers:** most have plenty of invoices, so they should barely move.
  - A few customers with only 1–2 invoices would lose their order-value and trend measures and be scored on recency only.
  - I expect a handful of scores to move toward the middle. I'll list them by name.
- **Zoho-only customers** (Benton, Truhlar, Chanay and others): already at a flat 60, so likely no change.
- **Morlong** (one deal, 97): order value is already left out, and recency is kept. So Morlong likely stays high, with "Low confidence — based on a single sale".
  - This is the one place the plan still lets a single record count. Tell me if you want recency to need 3 records too.
- **Chai (2 customers):** fewer than 5 customers, so every comparison between customers switches off.
  - Only own-history, recency and horizon measures remain.
  - The customer-page scores (91 and 74) may move toward 50, or show no score at all. This is the account most likely to change.
- **Three test accounts:** small, so they are likely to lose comparisons between customers. Their scores may disappear rather than change.
- **The 8 homepage demo customers:** these are exactly the risky group. There are 8 customers (more than 5), but the softened spread would pull their extremes toward the middle.
  - **I expect some of them to move**, most likely the most extreme ones, such as Meadowbank Logistics.
  - The homepage panel reads a saved snapshot, so the live homepage wouldn't change by itself. But the snapshot would no longer match what the engine produces.
  - Options: re-save the snapshot with your approval, or skip the softening for the demo. I recommend re-saving, so the homepage stays honest.

## 3. SecureNest Zoho customers if the activity measures were added later

- With 1–2 activities each, everyone fails the 3-record minimum, so both measures are left out for all of them.
- The 21–29 nightly alarms don't happen. Scores stay where they are today (a flat 60, or whatever their sales data gives).
- The measures switch on by themselves once 5 customers have 3 or more activities each.

## 4. Risks and things to decide

- **New customers get no score.** I think that's acceptable and matches "precision beats recall". How it should look:
  - Show "Not enough data yet — scored after 3 records" instead of a number.
  - Keep them out of the risk counts, the daily brief and the weekly digest, and don't count them as healthy.
  - The nightly job already skips customers with no measures, so this reuses that path.
- **Small accounts lose most scoring.** An account with fewer than 5 customers (like Chai) never gets comparisons between customers. It relies on own-history and recency only. That's fine for real customers, but a demo or trial account could look empty. The page needs a clear message, not a blank.
- **Fewer measures makes the rest weigh more.** With order value left out, one remaining measure (recency) can drive the whole score. That's Morlong's case. Confidence already flags it as Low, and I'd keep that visible.
- **Measures switching on or off as data arrives:** a score can jump the night a measure crosses 5 customers. I'd note it in the reason text ("now compared with similar customers").
- **Stored history:** old saved scores keep the extreme values. No rewrite is planned.
- **Softening lowers true alarms slightly too.** A customer who really is far out still scores low, but less sharply at the edges. This is the precision-over-recall trade-off you asked for.

## 5. Effort

- Medium: about 1 to 1.5 days, including tests.
- A full before-and-after across all accounts and the demo customers, for your approval before anything is published.

## Build order (after approval)

1. Read-only comparison across every account and the 8 demo customers, to confirm the estimates above.
2. Shared evidence module with the 3-record minimum, the 5-customer minimum and the softened spread. Move the deal and ticket minimums into it.
3. Wire it into both the customer page and the nightly score.
4. "Not enough data yet" display, and exclusion from risk counts, the daily brief and the digest.
5. Tests: thresholds, softening, both screens agreeing, demo snapshot check.
6. Before-and-after report. Nothing is published until you approve.

## Technical notes

- New module: `src/lib/metric-evidence.ts`, used by `customer-scoring.ts` and `real-scoring.ts`. It replaces `MIN_DEAL_PEERS` and `MIN_TICKET_PEERS` at their call sites.
- Record counts per customer come from the `series` that `metric-resolution.ts` already returns. The minimum reuses `MIN_NORMAL_RECORDS` (3).
- Softened spread: `50 + clamp((value - median) / max(MAD, floor), -1, 1) * 50`, then flipped for "fewer is better" measures. `floor` stops tiny spreads from inflating the result.
- Record the decision in AGENTS.md.
