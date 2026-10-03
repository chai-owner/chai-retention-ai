# Deploying the 3 Edge Functions — run these yourself

I wrote the code for `daily-sync`, `daily-score`, and `plan-changes` and copied it
into your repo at:

    chai-retention-ai/supabase/functions/

(`daily-sync/`, `daily-score/`, `plan-changes/`, plus a shared `_shared/` folder
they all import from.)

I can't deploy it myself — Anthropic's network policy for this account blocks
`api.supabase.com` (the Supabase management API that `supabase` CLI needs) from
every shell I have access to, including the one on your own machine. So this
last step needs to happen in your own terminal, outside Claude.

## 1. Install the Supabase CLI (if you don't have it)

    npm install -g supabase

## 2. Set the access token I generated

I created a temporary, project-scoped access token (7-day expiry, limited to
Edge Functions + Edge Function Secrets read-write and read-only project
metadata — nothing else) on "ChAi's Project". It's shown once on Supabase's
own token page, so if you don't have it handy, generate a fresh one instead:
https://supabase.com/dashboard/account/tokens

    setx SUPABASE_ACCESS_TOKEN "sbp_...your_token..."

(Restart your terminal after `setx`, or just `set SUPABASE_ACCESS_TOKEN=sbp_...`
for the current session only.)

## 3. Link and deploy

    cd chai-retention-ai
    supabase link --project-ref caujcnyrmpakrkjiffet
    supabase functions deploy daily-sync
    supabase functions deploy daily-score
    supabase functions deploy plan-changes

## 4. After deploying — tell me and we'll do the rest together

Once these are live I still need to, with you:
- Set the Edge Function secrets they depend on (CRON_SECRET, a *freshly
  generated* APP_USER_CONNECTION_KEY_SECRET, PADDLE_SANDBOX_API_KEY /
  PADDLE_LIVE_API_KEY, PAYMENTS_*_WEBHOOK_SECRET, and your QuickBooks / Xero /
  FreshBooks / Zendesk / Intercom / Zoho OAuth app credentials) — I'll give you
  the exact `supabase secrets set` commands once you tell me you have those
  values, since I should never see the raw secrets myself where avoidable and
  can't fetch them for you.
- Recreate the 5 pg_cron jobs on the destination project pointing at these new
  function URLs (I still have `weekly-digest` and `trial-lifecycle` on hold —
  those need a new email provider decision first, since they depended on
  Lovable's managed email API).
- Manually test each function once secrets are in place.
- Revoke the temporary access token once deploy is done.
- Run the deeper final-verification pass (Task 9).

## 5. Revoke the token when you're done

Delete it here: https://supabase.com/dashboard/account/tokens — it expires on
its own in 7 days anyway, but no reason to leave it live once deploy succeeds.
