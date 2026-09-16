# Impersonation session hardening

## Goal
Make admin impersonation temporary, server-enforced, non-persistent in the browser, visibly controllable, and fully audited without changing other admin capabilities.

## Implementation
- Replace the current `localStorage` impersonation record with an in-memory app store. Keep the admin credentials only in that volatile store so they are never written to browser storage by the impersonation feature.
- Add a server-issued impersonation identifier and server-side status check based on the audit record’s authoritative start time. Sessions expire exactly 30 minutes after start; the server atomically closes an expired session with reason `timeout`.
- Update manual termination to validate the target identity and atomically record `ended_at` plus reason `manual`.
- Add automatic lifecycle handling in the authenticated app shell: check status immediately, schedule expiration from server time, re-check periodically and on tab focus, restore the original admin session, clear all account-scoped caches, and return to `/admin`.
- Keep a prominent sticky “End impersonation” control visible throughout the impersonated app, including mobile layouts, with clear timeout feedback.
- Remove the old cache exception that preserved impersonation data in `localStorage`, and clear any legacy persisted impersonation value during startup.

## Database and security
- Add a constrained `end_reason` column (`manual` or `timeout`) to the existing `impersonation_audit` table.
- Preserve the existing admin-only read policy and service-only audit writes.
- Ensure start/end database errors fail closed instead of silently creating an untracked impersonation.
- Do not store admin access/refresh tokens in the audit table or any other persistent application table.

## Verification
- Add focused tests for the 30-minute boundary, active/expired status, manual versus timeout audit reasons, volatile store behavior, and legacy-storage cleanup.
- Run the relevant test suite and verify the live app builds without errors.
