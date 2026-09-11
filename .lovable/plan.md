# Remove cached privileged client initialization

## Changes
- Make privileged client creation request-scoped so credentials are resolved after the runtime environment is available.
- Update every admin-console operation to obtain a fresh privileged client inside the executing server call.
- Update other server-function callers that still depend on the legacy privileged-client wrapper.
- Remove obsolete singleton/proxy expectations and add regression coverage proving credentials are re-read between calls.

## Technical details
- Resolve `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` with the existing asynchronous server environment lookup immediately before `createClient`.
- Do not retain a module-level client instance or use a module-level privileged proxy.
- Keep authenticated user checks and all admin business logic unchanged.

## Verification
- Run the privileged-client regression tests.
- Run the complete test suite, TypeScript check, and production build.
- Confirm the latest preview build report is clean.
