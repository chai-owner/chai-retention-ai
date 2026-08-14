# Make integrations feed the Identity Hub correctly

The new matching approach resolves a customer by **(platform, id) + email + name**. Several integrations only send an id — sometimes an email or a raw ticket-system number stuffed into the `customer_id` column — so those rows can't auto-match and pile up in Identity Resolution.

## What's wrong today (verified in the sync code)

1. **Zendesk, Intercom, Freshdesk** send only `customer_id, ticket_id, created_date, status, category, satisfaction_score`. The requester's email (or a numeric requester id) is written *into* `customer_id`, and there is no `email` or `customer_name` column. The matcher looks for `email` / `contact_email` / `requester_email` / `customer_name`, finds nothing, and every support row becomes an unmatched group.
2. **Salesforce, HubSpot, Zoho CRM** build the customer roster with an **empty email column** (Salesforce Account, HubSpot company and Zoho Account queries never request an email or domain). Email is the only auto-link signal, so an empty roster email blocks matching for *all* other sources too.
3. **Reloaded data loses its platform tag.** Rows saved to the account are re-hydrated on app boot without the `__source` tag, so after a refresh Zendesk/Xero/HubSpot rows all show as "Unknown source" and saved links keyed to a platform stop applying.
4. Accounting (Xero, QuickBooks, FreshBooks) already populates customer email correctly — no change needed there.

## Changes

**Support syncs (Zendesk, Intercom, Freshdesk)**
- Extend the support dataset to `customer_id, email, customer_name, ticket_id, created_date, status, category, satisfaction_score`.
- Put the real platform id in `customer_id` (Zendesk requester id, Intercom contact external_id/id, Freshdesk requester id), the requester email in `email`, and the requester/organization name in `customer_name` — stop overloading `customer_id` with an email.
- Zendesk: include the sideloaded user's name and organization. Intercom: read the contact's name/email. Freshdesk: reuse the existing contact lookup for name as well as email.

**CRM syncs**
- Salesforce: add `Website` on Account and pull the primary Contact email per account, filling the roster `email` column (fall back to the website domain when no contact email exists).
- HubSpot: request the `domain` property and, where available, the associated primary contact email.
- Zoho CRM: request `Website` / account email fields and fill the same column.

**Persistence and reload**
- Store the originating platform on each saved row and re-apply it as the `__source` tag when hydrating, so saved links keep matching after a refresh.

**Tests**
- Extend the existing sync tests to assert every integration emits an identifier trio (id, email, name where the platform has it) and that a support row with only an email resolves to the roster customer.

## Result

Support tickets link to the right company automatically by email, CRM rosters carry the email that makes cross-platform links possible, and Identity Resolution only shows genuinely ambiguous records — labelled with the correct platform even after a page reload.
