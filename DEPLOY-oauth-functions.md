# Deploying the OAuth move (Connect QuickBooks / Xero / etc.) — run these yourself

## Why you, not me

Same reason as the last deploy doc: Anthropic blocks `api.supabase.com` (what
the `supabase` CLI needs to talk to) from every shell I can reach, including
the one on your own machine. So the actual deploy step has to happen in your
own terminal, outside Claude. Everything else — writing the code, checking it
compiles — is already done.

## What changed, in plain terms

The "Connect QuickBooks/Xero/FreshBooks/Zendesk/Intercom/Zoho" buttons in your
app were broken because the app's own hosting (Lovable) can't hold secret API
keys unless you're on their Enterprise plan. I moved that whole "click
Connect, get sent to log into QuickBooks, come back connected" flow onto two
new Supabase Edge Functions instead — `oauth-start` and `oauth-callback` —
since Supabase secrets already work fine (that's how your daily sync job gets
its keys). The app's frontend now calls these instead of the old broken path.
This doesn't touch anything else that's already working.

## 1. Commit the two changed files

Your `git status` is going to show almost your entire repo as "modified" —
that's a pre-existing line-ending thing (Windows vs. Unix) on your machine,
nothing to do with this change. Don't run `git add -A` or `git add .`, it'll
sweep all of that in. Just add the two files this actually touched:

    cd chai-retention-ai
    git add src/components/integrations-panel.tsx src/lib/oauth-edge.ts
    git commit -m "Move OAuth connect flow to Supabase Edge Functions"
    git push

Then publish it the way you normally get a change live (push to whichever
branch Lovable/Vercel watches, or however you usually deploy the frontend).

## 2. Get a Supabase access token

If you don't still have the token from last time (they expire after 7 days),
grab a fresh one here: https://supabase.com/dashboard/account/tokens

    setx SUPABASE_ACCESS_TOKEN "sbp_...your_token..."

(Restart your terminal after `setx`, or use `set SUPABASE_ACCESS_TOKEN=sbp_...`
just for the current window.)

## 3. Deploy the two new functions

If you don't have the CLI yet: `npm install -g supabase`

    cd chai-retention-ai
    supabase link --project-ref caujcnyrmpakrkjiffet
    supabase functions deploy oauth-start --use-api
    supabase functions deploy oauth-callback --use-api --no-verify-jwt

The `--no-verify-jwt` on `oauth-callback` is required — QuickBooks redirects
your customer's browser straight to that URL, so it can't require them to be
signed into ChAi first. `oauth-start` doesn't get that flag: it checks the
person's ChAi login itself.

## 4. Set the QuickBooks secrets

    supabase secrets set QUICKBOOKS_CLIENT_ID="paste your Client ID here"
    supabase secrets set QUICKBOOKS_CLIENT_SECRET="paste your Client Secret here"
    supabase secrets set ACCOUNTING_REDIRECT_URI="https://caujcnyrmpakrkjiffet.supabase.co/functions/v1/oauth-callback/accounting"

`ACCOUNTING_REDIRECT_URI` is shared — when you add Xero and FreshBooks later,
this same value covers all three, nothing to change.

By default this connects to real QuickBooks accounts (production). If you
ever want to test against a QuickBooks sandbox company instead, you can add
`supabase secrets set QUICKBOOKS_ENVIRONMENT="sandbox"` — skip this for now.

## 5. Register the redirect URL with Intuit

In the Intuit developer console, on your QuickBooks app's Keys & OAuth page,
add this exact URL under "Redirect URIs":

    https://caujcnyrmpakrkjiffet.supabase.co/functions/v1/oauth-callback/accounting

It has to match character-for-character or QuickBooks will reject the login.

## 6. Test it

Open the app → Integrations → "Connect QuickBooks". It should send you to
Intuit's login/consent screen and land you back on the Integrations page,
connected.

## Later: the other 5 providers

Same pattern, one redirect URL per provider (register each with that
provider, once you have credentials for it):

- Xero, FreshBooks → same URL as QuickBooks above (`.../oauth-callback/accounting`) — shared with QuickBooks
- Zendesk → `.../oauth-callback/zendesk`
- Intercom → `.../oauth-callback/intercom`
- Zoho CRM → `.../oauth-callback/zoho`

Tell me when you've got credentials for one of these and I'll give you that
provider's exact `secrets set` commands.
