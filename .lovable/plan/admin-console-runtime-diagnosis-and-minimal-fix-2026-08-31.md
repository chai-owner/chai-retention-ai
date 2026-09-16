# Admin console runtime diagnosis and minimal fix

## Confirmed diagnosis

The failing page is the production `/admin` route at `https://chai-retention-ai.lovable.app/admin`.

Its initial load calls the TanStack server function `listCustomers`:

```text
/admin
  → AdminPage.load()
  → useServerFn(listCustomers)
  → GET /_serverFn/bbbc6bac537dd93f6b1643dc038c6fb8fcc130edf741772fb605f18dd1b4445f
  → requireConnectedAuth
  → assertAdmin / has_role
  → dynamic import of client.server.ts
  → first supabaseAdmin.from(...) access
  → createSupabaseAdminClient()
```

The exact displayed error can only be constructed by the missing-environment guard in `src/integrations/supabase/client.server.ts`. The frontend does not replace another backend exception with that text: it displays the caught server-function message verbatim beneath its generic “Your session may have expired” copy.

The root cause is therefore a runtime-binding mismatch:

- The **published production server-function worker** does not have `process.env.SUPABASE_URL` or `process.env.SUPABASE_SERVICE_ROLE_KEY` bound when the lazy privileged client is first used.
- Authentication can still get as far as the admin handler because `requireConnectedAuth` falls back to bundled `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. That explains why normal signed-in behavior can remain healthy while the privileged admin query alone fails.
- The healthy Lovable Cloud backend is not the problem; it is up and responding normally.
- The service-role credential is not present in the browser bundle. `client.server.ts` is dynamically imported inside server handlers and its privileged value is read only from `process.env`.

## Deployment findings

- The production URL serves the expected `/admin` route and its server-function endpoint is live.
- Direct requests to that exact production RPC return structured authentication errors, proving requests reach the production server-function runtime rather than a browser-only or preview path.
- The production admin bundle uses the same `listCustomers` server-function ID as the current build, so this is not a missing route or mismatched RPC manifest.
- Production logs contain no matching records in the available one-hour window, so they do not provide a deeper stack trace.
- The deployed browser bundle is behind the current workspace in unrelated impersonation details. This confirms production has not received the latest complete bundle, but it does not manufacture the missing-variable text; the production server client itself emits that message.
- The earlier environment check observed a different runtime context (the development/preview process or project-level connection state), not the bindings visible inside the published server-function worker.

## Smallest safe fix

No application code or database change is required for the primary failure.

1. Rebind the existing Lovable Cloud managed backend variables to the app runtimes.
2. Rebuild and republish the current app so the production worker receives those bindings and the deployed bundle matches the workspace.
3. Do not create user-managed copies of the service-role credential and do not expose it through any `VITE_` variable.
4. Verify the authenticated production `/admin` load and confirm `listCustomers` completes through the privileged `profiles` query.

## Verification after approval

- Confirm the production RPC is still the expected `listCustomers` function.
- Load `/admin` as the signed-in administrator and capture the server-function response status/body without exposing tokens.
- Confirm the customer list renders and the missing-environment guard no longer fires.
- Check production runtime logs for errors from authentication, `has_role`, privileged-client creation, and the `profiles`/`ai_usage_log` queries.
- Confirm ordinary signed-in pages and admin authorization behavior are unchanged.

## Optional follow-up code hardening

Not required to restore service. In a separate approved change, the admin UI could classify authentication, authorization, configuration, and query failures separately rather than showing “Your session may have expired” for every non-forbidden backend error. Server diagnostics could also log a safe stage identifier while keeping environment names and credentials out of browser responses.
