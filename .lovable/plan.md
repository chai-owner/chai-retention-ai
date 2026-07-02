# Handle churned customers in ChAi

## Goal
Add a proper lifecycle stage for customers who have already left. Churned accounts stop polluting active retention metrics, get their own space, and become fuel for **win-back** (re-engagement targets) and **learning** (why they left). Detection is **both** auto-inferred and manually confirmed.

Consistent with the rest of the app, this stays in the frontend/mock-data layer (customers are demo data in `src/lib/mock-data.ts`, not a database table).

## 1. Data model (`src/lib/mock-data.ts`)
- Add a lifecycle field to `Customer`: `status: "active" | "churned" | "won-back"` (default `active`).
- For churned customers add:
  - `churnedDate` — when they left.
  - `churnReason` — the dominant factor(s) that preceded churn (reuse existing `factors`).
  - `winBackScore` (0–100) — likelihood they can be re-won, plus a `winBackDifficulty`.
- Seed ~4–6 churned demo accounts (and 1 "won-back") so every new view has content.
- Add helpers: `getActiveCustomers()`, `getChurnedCustomers()`, and a `churnAnalytics()` aggregator (churn rate, revenue lost/yr, top churn reasons).
- Keep churned accounts **out** of the datasets that feed health averages, revenue-at-risk, and retention-opportunity.

## 2. Auto-inference + manual flag
- Add a pure helper `inferChurnRisk(customer)` that flags likely-churned accounts from signals (subscription ended / long inactivity / no revenue past cadence).
- On a customer's detail page (`_authenticated.app.customers.$id.tsx`), when auto-inference suggests churn, show a banner: **"Looks churned — confirm?"** with **Mark as churned** / **Still active** actions.
- Add a manual **"Mark as churned"** action (with reason capture) available from the detail page. Persist the override in a small local store (mirroring the `addons-store` / `uploads-store` pattern) so it survives within the session.

## 3. Keep active views clean
- Risk Center list (`_authenticated.app.customers.index.tsx`): default to active customers only; add a filter chip set — **Active · Churned · Won back**.
- Dashboard metrics unchanged in logic but now correctly exclude churned accounts; add a small **"Churned this period"** stat and **revenue lost / yr** (italic, matching the existing per-year styling) so loss is visible without distorting at-risk numbers.

## 4. New "Churned & Win-back" view
New route `src/routes/_authenticated.app.churned.tsx` (nav entry in `app-shell.tsx`):
- **Win-back candidates** — churned customers ranked by `winBackScore`, each with a tailored recommendation ("send return offer," "re-onboard," "exec re-approach") and estimated recoverable revenue.
- **Why customers leave** — aggregated churn-reason breakdown (bar list of top factors with % share) from `churnAnalytics()`, so the team learns patterns.
- Summary stats: churn rate, total revenue lost, average tenure before churn, win-back opportunity.

## 5. Won-back path
- Marking a churned customer as re-engaged sets `status: "won-back"`, moves them out of win-back candidates, and surfaces them in a small "Recently won back" strip for positive reinforcement.

## Scope / non-goals
- Frontend + mock-data only; no database schema changes (customer data is demo data).
- No changes to onboarding, pricing, or the AI ingestion features.
- Reuse existing components (`PageHeader`, `StatCard`, `Card`, `HealthBadge`) and design tokens — no new palette.
