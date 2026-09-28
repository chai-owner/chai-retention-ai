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
- Measure direction (more vs fewer is better) comes only from src/lib/metric-direction.ts, used by both the customer page and the nightly score; ticket measures need data for at least 5 customers (MIN_TICKET_PEERS = MIN_DEAL_PEERS) — why: the two screens disagreed on direction, and 3-customer comparisons stretched into 0/100 extremes.
