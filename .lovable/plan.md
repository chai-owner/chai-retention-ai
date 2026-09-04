# Diagnose live AI configuration and onboarding auth

## Goal
Add a safe live-runtime diagnostic for the AI provider and confirm that a newly verified user can reach metric generation during onboarding.

## Implementation
1. **Safe AI diagnostic**
   - Add an authenticated `checkAiConfig` server function next to the existing AI functions.
   - Report whether `LOVABLE_API_KEY` exists, which supported runtime source supplied it, an irreversible eight-character SHA-256 fingerprint, and whether a minimal real AI request succeeds.
   - Do not return or log any characters from the secret itself.
   - Expose a small browser-console helper on onboarding so the check can be run against the published site without manually invoking TanStack's internal RPC endpoint.

2. **Environment visibility**
   - Extend the server environment helper to identify the successful lookup source without exposing values.
   - Log the exact variable name, lookup source, and presence status for diagnostic and failed AI calls.
   - Keep ordinary AI behavior unchanged.

3. **Fresh-signup authentication**
   - Verify the global bearer-token attachment and `requireConnectedAuth` path used by `recommendMetrics`.
   - Add focused tests covering authenticated middleware/config diagnostics and the metric-generation call path where practical.

4. **Verification**
   - Run the new live diagnostic, targeted tests, the full test suite, and the production build.
   - Recheck published server and AI Gateway logs for the diagnostic request and report whether publishing is required before the live domain can use it.

## Security note
The requested first eight secret characters will be replaced by an eight-character one-way fingerprint. This distinguishes keys without exposing reusable credential material to browser code.
