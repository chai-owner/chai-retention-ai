# ChAi — Onboarding, Insights Gate & Admin Backend

Built in 4 phases. Each phase is independently shippable.

## Decisions locked in
- **Impersonation:** full acting-as sessions for admins (with audit trail).
- **Token tracking:** start logging real token usage per user on every AI call going forward.
- **Locked state:** users see the top-insights + booking screen every login until an admin unlocks them, but can still revisit Business Profile and Data pages to improve inputs.
- **Calendly:** popup widget using `https://calendly.com/calendar-askchai/30min` with the brand color `#c16e2d`.

---

## Phase 1 — Registration & authentication

**Goal:** A proper sign-up (name, email, password) that requires email confirmation before entering the app.

- Add a **Name** field to the register form in `src/routes/auth.tsx`. Pass it as `options.data.full_name` on `supabase.auth.signUp` so it lands in user metadata.
- Keep the existing "Check your email to confirm" screen (already present) as the post-register state. Email confirmation stays ON (do not auto-confirm).
- Store profile identity: add `full_name` and `email` columns to `profiles`, and update the `handle_new_user()` trigger to copy name/email from the new auth user into `profiles` on signup. This gives admins a name/email to display without touching the `auth` schema.
- Google sign-in stays as-is.
- After confirmation, the confirmation link logs the user in and lands them on the guided flow (Phase 2) because they are not yet onboarded.

Technical: migration adds columns + updates trigger function; `profile.functions.ts` extends its select/upsert to include `full_name`/`email` (read-only from trigger).

---

## Phase 2 — Guided "Let's get started" flow

**Goal:** One continuous guided experience after first login, replacing the current standalone onboarding.

Extend `src/routes/_authenticated.onboarding.tsx` into a multi-stage wizard:

1. **Tell us about your business** — the full existing Business Profile question set (already built in onboarding steps 0–5: business, segments, how you work, what matters, tracking, interactions). Kept as-is.
2. **Connect integrations** — a new step that reuses the integration cards from `src/routes/_authenticated.app.data.tsx` (support tools, CRM, accounting). Adds short benefit copy per *category* explaining why connecting each helps retention insight. Connecting is optional (users can skip).
3. **Data Drop / Upload CSVs** — a new step explaining the benefits of ChAi Data Drop (AI document ingestion) and offering manual CSV upload via the existing `UploadWizard`. Also optional/skippable.

At the end, instead of routing to `/app/dashboard`, it runs the initial assessment and routes to the new insights screen (Phase 3). Onboarding completion still sets `onboarded = true`.

Technical: the two new steps are presentational, importing existing wizard components. No new business logic beyond wiring.

---

## Phase 3 — Initial insights screen + Calendly booking (the locked landing)

**Goal:** After onboarding, generate collective insights and show a booking-focused summary instead of the dashboard. This becomes the default landing for locked accounts.

- New route `src/routes/_authenticated.app.welcome.tsx` (the locked landing).
- **Assessment summary line:** "We've analyzed X customers, X months of revenue, X support tickets…" derived from the scored dataset / uploads / profile.
- **Top 4–5 collective insights:** a new AI server function in `ai.functions.ts` (`generateCollectiveInsights`) that takes the workspace summary and returns the 4–5 highest-interest findings. Falls back to computed insights if AI is unavailable.
- **Booking CTA:** copy "We'll open up your full dashboard and insights at your onboarding." with **"Let's schedule that session now!"** wired to the Calendly popup. The Calendly `widget.css`/`widget.js` are loaded via a `<link>`/`<script>` in the root head; clicking calls `Calendly.initPopupWidget({url: '…?hide_event_type_details=1&hide_gdpr_banner=1&primary_color=c16e2d'})`.
- **Booking confirmation:** listen for Calendly's `calendly.event_scheduled` postMessage; on booking, persist a `booked_at` timestamp to `profiles` and show a "Your onboarding is booked — we'll be in touch" confirmation, staying on this screen.

**Locking behavior:**
- Add `unlocked boolean default false` (and `booked_at timestamptz`) to `profiles`.
- Update `src/routes/_authenticated.tsx` `beforeLoad`: an onboarded-but-not-unlocked user is redirected to `/app/welcome` for any `/app/*` route **except** Business Profile (`/app/settings`) and Data (`/app/data`), which stay accessible so they can keep improving inputs. Unlocked users get the full app as today.
- Sidebar/nav (`app-shell.tsx`) hides locked pages for locked users, showing only Welcome, Business Profile, and Data.

---

## Phase 4 — Admin backend

**Goal:** Admin console to manage customer accounts.

Rework `src/routes/_authenticated.admin.tsx` (admin-gated via existing `has_role`) into a customer console with three capabilities. All privileged reads/writes go through new admin server functions that verify `has_role(uid,'admin')` before using the service-role client.

1. **Customer list** — every user with profile (name, company, email, onboarded, unlocked, booked status, signup date). Replaces/augments the current waitlist table.
2. **Unlock accounts** — a per-user toggle that sets `profiles.unlocked = true/false`, immediately switching what that user sees on next load.
3. **AI token monitoring** — new `ai_usage_log` table (`user_id`, `operation`, `model`, `input_tokens`, `output_tokens`, `total_tokens`, `created_at`). Every AI server function (`askChai`, `summarizeRiskReasons`, `generateCollectiveInsights`) writes a usage row from the `generateText` result's usage metadata, attributed to the calling user. Admin console shows per-user totals and a grand total.
4. **Full impersonation** — admin picks a user and starts an "acting as" session:
   - A `startImpersonation` admin server function verifies admin role, records an `impersonation_audit` row (admin id, target id, started_at), and issues a scoped session for the target user via the Auth Admin API (service role), returned to the client to `setSession`.
   - A persistent banner ("You are viewing as <user> — Exit") lets the admin end impersonation and restore their own session.
   - An `impersonation_audit` table provides the audit trail (who impersonated whom, when, ended_at).

Security notes: admin-only server functions re-check `has_role` server-side (never trust client). RLS + GRANTs added for every new table. Service-role client loaded inside handlers only.

---

## Data model changes (summary)
- `profiles`: `+ full_name text`, `+ email text`, `+ unlocked boolean default false`, `+ booked_at timestamptz`.
- `handle_new_user()` trigger: copy name/email into profile.
- New `ai_usage_log` table (+ GRANTs, RLS: users read own, admins read all).
- New `impersonation_audit` table (+ GRANTs, RLS: admin only).

## Suggested build order
Phase 1 → Phase 3 (insights + lock) → Phase 2 (guided steps) → Phase 4 (admin). Phases 1 and 3 unblock the core user experience; Phase 4 is standalone.

Confirm and I'll start with Phase 1.