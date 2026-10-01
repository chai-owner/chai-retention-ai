# Account data currency (USD or ZAR) — investigation and plan

Labels and formatting only. No conversion, no exchange rates.

## 1. Where money shows today

Almost everything goes through one shared helper, which always formats as US dollars with no decimals (and short "1.2M" style over a million):
- Dashboard: tiles, revenue at risk, retention opportunity, chart axis
- Customer page, including "est. saved" on recommendations
- Risk Center revenue column
- Churned & Win-back, Insights, Transactions
- Welcome / daily brief text
- Ask ChAi summary sent with each question
- Homepage demo risk card (also uses this helper)

Exceptions:
- **Ask ChAi, server side:** one line writes "$" plus the raw number (no commas). This needs fixing anyway.
- **Admin screens:** two separate US-dollar formatters (admin console and admin billing).
- **Subscription pricing:** pricing page, change-plan box and trial banner each write "$" by hand.

No money shown:
- Weekly digest email (counts only)
- Data Drop review screens (row counts only)
- No customer or transaction export (CSV) found

## 2. Fixed dollar amounts in the maths

- Scoring, "est. saved", revenue at risk and payment health are all proportions or days overdue. Rand-sized numbers give correct results.
- There are no fixed dollar cut-offs in scoring, recommendations or defaults.
- Only the made-up demo data uses dollar-sized amounts. That data is separate and stays USD.
- Customer segments are monthly revenue ranges the user types in. Their labels say "($)". A ZAR account keeps the same ranges, which just mean rand. The label should follow the setting.

## 3. Integrations

- **Each invoice or deal's currency:** already saved. QuickBooks, Xero, FreshBooks, HubSpot and Zoho all store a currency code on each synced row.
- **Gap:** when QuickBooks leaves out the currency, ChAi records "USD". That should be blank ("unknown") instead.
- **Organisation's base currency:** not fetched or stored for any connection.
- **Adding it:** low to moderate effort. It takes one extra read per connection (QuickBooks company info, Xero organisation, FreshBooks account, HubSpot/Zoho account settings), saved on the connection.

## 4. Proposed design

- **Setting:** "Data currency" on the Business Profile, USD or ZAR. Existing accounts default to USD. New sign-ups get USD until they choose.
- **Suggestion:** if a connected Xero or QuickBooks organisation reports ZAR (or USD) and that differs from the setting, a banner on Business Profile and Data Uploads & Integrations says: "Your Xero organisation uses ZAR. Switch data currency to ZAR?" The user clicks to switch. Nothing changes on its own. Dismissing the banner is remembered.
- **Mixed currencies:** invoices or deals in another currency are left out of revenue totals, revenue at risk and "est. saved". They stay visible on the Transactions page, labelled with their own code (e.g. "USD 1,200"). Data Quality gets a new item: "N records are in USD, not your account's ZAR — left out of revenue totals". Rows with no currency count as the account's currency (most CSVs have none). That assumption is shown on Data Quality.
  - This is a scoring change. Customers whose only sales are in another currency will have no revenue figure.
- **ZAR format:** "R 12,500" (R, space, comma thousands, no decimals on tiles), plus "R 1.2M" for large amounts. I agree, with one note: South African standard style uses a space for thousands ("R 12 500"). Commas read more clearly next to USD and match the rest of the app, so I'd keep your proposal. USD stays "$12,500".
- **Single formatter:** one money helper that takes the account currency. Every screen in section 1 uses it, including segment labels.
- **Ask ChAi:** the summary carries the currency code and pre-formatted amounts. The instructions add: "All amounts are in {ZAR}; use 'R'; never use another currency symbol; never add amounts in different currencies." The raw "$" line gets fixed.

## 5. What stays USD

- **Subscription pricing (Paddle):** confirmed separate. The pricing page, change-plan box, trial banner, admin billing and payment code all have their own formatting and won't change.
- **Homepage demo:** it shares the customer money helper today. The plan pins it to USD explicitly, so it never follows any account setting.
- **Admin console amounts:** these are ChAi's own billing figures, so they stay USD.

## 6. Risks, tests, effort

**Risks:**
- Missing a "$" somewhere. Mitigation: a test that fails if "$" or a hardcoded USD format appears outside the allowed billing and demo files.
- Leaving out other-currency rows lowers revenue at risk for mixed accounts. This is intended, but it's visible.
- The QuickBooks "USD when missing" default could wrongly flag ZAR accounts as mixed. It's fixed first.
- Older synced rows keep any "USD" already written. They need a re-sync, or must be treated as unknown.

**Tests:**
- Formatter: USD, ZAR, millions, negatives, zero.
- Setting saves and loads, defaulting to USD.
- Mixed-currency rows are left out of totals and counted on Data Quality.
- Rows with no currency count as the account's currency.
- Suggestion appears only when the organisation and setting differ, and never switches by itself.
- Ask ChAi summary uses "R" and its instructions include the currency rule.
- Billing and homepage demo stay "$".
- The "no stray $" check.

**Effort:** about 2–3 days.
- Setting and formatter rollout: 1 day
- Mixed-currency handling and Data Quality item: 1 day
- Base-currency fetch and suggestion banner: 0.5–1 day

## Technical details

- New `profiles.data_currency text not null default 'USD'`, limited to USD/ZAR with a validation trigger. Exposed through profile.functions and profile-store.
- New `base_currency text` on accounting_connections, and the equivalent on the CRM connection tables (zoho_crm_connections and the HubSpot app-user connection metadata).
- Replace `formatCurrency` in src/lib/mock-data.ts with `formatMoney(n, currency)` in a new src/lib/money.ts, plus a `useAccountCurrency()` hook. The demo uses `formatMoney(n, "USD")`.
- Revenue aggregation in src/lib/real-scoring.ts filters rows where `currency` is set and differs from the account currency. It returns `excludedForeignCurrency` counts for Data Quality.
- accounting.server.ts:931 changes `?? "USD"` to `?? ""`.
- ai.functions.ts:229 uses the formatter. ASK_CHAI_STYLE_RULES gets the currency rule.
