<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Custom measures only use data of their own kind (src/lib/metric-resolution.ts): a column must share a word with the measure's name (or a narrow synonym), CRM activity_* columns feed only activity measures, tickets measures count support tickets, otherwise the measure is left out — why: fuzzy related-word matching made Zoho activities score as downloads/logins/tickets.
- Measure direction (more vs fewer is better) comes only from src/lib/metric-direction.ts, used by both the customer page and the nightly score — why: the two screens disagreed on direction.
- Evidence rules come only from src/lib/metric-evidence.ts (both screens): a count/average/rate measure scores a customer only with 3+ records (dated only when the measure needs time: recency, trends, frequency per period), and a cross-customer comparison needs 5+ such customers (deal and ticket minimums alias MIN_PEERS); recency and single-value measures are exempt; customers with no scorable measure are flagged notEnoughData and kept out of risk counts — why: thin data produced extreme scores and false alarms (precision over recall).
- Identity Resolution groups saved matches through groupCustomerMatches, which always partitions every rule into current-customer, orphaned, or ignored groups — why: missing customers and ignored rules must never disappear from the combined view.
- Dashboard zero-revenue captions use the shared revenueZeroHint rule and scoring's usable-revenue marker — why: a zero estimate must not imply certainty when customers cannot be scored or their amounts were excluded.
