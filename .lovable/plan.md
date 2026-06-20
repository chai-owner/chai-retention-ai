# Personalize uploaded data based on onboarding

Right now onboarding collects rich answers (business model, what counts as success, etc.) but throws them all away on finish. The Data page then shows the same fixed list of datasets and fields to everyone. This plan persists the onboarding profile and makes the Data page adapt its required/recommended datasets and fields to that profile.

## What the user will see

- After completing onboarding, their answers are remembered (survives reload).
- On the Data & Integrations page, datasets are split into **Required for your business** and **Optional / recommended**, driven by their business model and how they defined success.
- Each required dataset shows a short "Why ChAi needs this" note tied to their answers (e.g. *"You said renewals signal success — upload Transactions so we can track them"*).
- Certain fields get promoted to required based on the profile (e.g. SaaS → `logins`/`features_used` on Product usage; Ecommerce → repeat-purchase fields; success = renewals → `transaction_date`/`amount`).
- If a needed dataset hasn't been uploaded yet, it's highlighted with an explanation of why it matters for them.

## How it works

### 1. Persist the onboarding profile (localStorage)
Create `src/lib/profile-store.ts` following the existing `uploads-store.ts` pattern (`useSyncExternalStore` + a module store), but backed by `localStorage`:
- `OnboardingProfile` type capturing the fields that matter for personalization: `company`, `industry`, `model`, `segments`, `successActions`, `disengagement`, `tracked` (the toggled questions), `channels`.
- `profileStore` with `getSnapshot`, `subscribe`, `save(profile)`, and `clear()`. Read/write `localStorage` key `chai.onboarding.profile`, guarded for SSR (`typeof window`).
- `useProfile()` hook returning the current profile (or `null` if onboarding never completed).
- A sensible default/fallback profile so the Data page still works in demo mode when nothing is stored.

### 2. Save answers at the end of onboarding
In `src/routes/onboarding.tsx`, in `finish()`, call `profileStore.save({...form, segments, tracked, channels})` before navigating to the dashboard. No UI changes to the onboarding steps themselves.

### 3. Derive personalized schema requirements
Add a pure helper, `src/lib/personalize-data.ts`:
- `personalizeDatasets(profile, schemas)` → returns each `DatasetSchema` annotated with:
  - `required: boolean` — whether this dataset is needed for the profile.
  - `reason: string` — plain-language "why" tied to the answers.
  - `fields` with possibly-promoted `mandatory` flags.
- Rules (driven by **business model** and **what counts as success**):
  - `customers` is always required (core list).
  - Model-based: SaaS/Subscription/Membership → `usage` required (logins, features_used promoted); Ecommerce/Marketplace → `transactions` required (repeat-purchase emphasis); Insurance/Telecom/Financial Services → `transactions` required (renewals/claims); etc. A lookup map keyed by `model` with a default.
  - Success-based: scan `successActions` + `disengagement` text (and `tracked` toggles) for keywords — "renew"/"purchase"/"buy" → require `transactions`; "login"/"engage"/"adoption"/"feature" → require `usage`; "satisf"/"nps"/"csat"/"survey" → require `surveys`; "support"/"ticket"/"complaint" → require `support`.
  - Each rule contributes a human-readable `reason`; reasons are merged per dataset.

### 4. Update the Data page UI
In `src/routes/app.data.tsx`:
- Read `useProfile()`, compute `personalizeDatasets(...)`.
- Replace the single "Download an example file" grid with two groups: **Required for your business** (with the per-dataset "Why ChAi needs this" note and a "missing" highlight if not yet in `uploads`) and **Optional / recommended**.
- Keep existing download buttons, field chips, and `*` required styling; required-by-profile fields render with the same danger styling.
- Add a small contextual line referencing the profile (e.g. *"Tailored to your {model} business and how you defined success."*) with a graceful fallback when no profile exists.

## Technical notes
- Pure presentation + a localStorage-backed store; no backend, matching the current demo. No Lovable Cloud.
- SSR-safe: the store returns `null`/default during server render and hydrates on the client (same approach as `uploads-store`).
- No changes to CSV/Excel template generation — promoted-mandatory fields still export fine.

## Files
- Add `src/lib/profile-store.ts`
- Add `src/lib/personalize-data.ts`
- Edit `src/routes/onboarding.tsx` (save profile in `finish()`)
- Edit `src/routes/app.data.tsx` (personalized dataset sections + reasons)
