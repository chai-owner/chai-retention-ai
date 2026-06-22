# Weighted Customer Health from Onboarding

Make the Customer Health score depend on how important each metric is to the user. The user rates the 8 core metrics on an "Unimportant → Critical" progress bar during onboarding; those ratings become weights that recompute every customer's health score and are shown on the Intelligence Planner.

## The 8 metrics (shared everywhere)
Login frequency, Feature adoption, Days since last purchase, Average order value, Support ticket volume, Resolution time, CSAT / NPS, Contract renewal date — the existing `plannerMetrics` set.

## 1. Onboarding — new "What matters most" step
- Insert a new step (e.g. after "What to track") titled **"How much each metric matters"**.
- One row per metric showing the metric name + short description, with a **progress-bar slider** on a 5-level scale:

```text
Unimportant  ──●────────────  Critical
   1       2     3     4      5
```

- Each metric defaults to a **sensible importance** (see defaults below) so the bars start pre-filled.
- Levels map to labels: Unimportant, Low, Moderate, High, Critical.
- Save the chosen levels into the onboarding profile as `metricWeights` (metric name → 1–5).

## 2. Health score = weighted blend
- Give each demo customer a **per-metric sub-score** (0–100) for all 8 metrics (deterministic from the existing seeded RNG).
- Health score = weighted average of sub-scores using the user's importance weights:
  `health = Σ(subScore[m] × weight[m]) / Σ(weight[m])`, rounded.
- Risk, churn probability, and risk category derive from this recomputed health (same formulas already used).
- When no onboarding weights are saved, use **baked-in defaults** so the demo still looks reasonable.

### Default importance weights
Engagement & satisfaction weighted highest:
- Login frequency: Critical (5)
- Feature adoption: High (4)
- CSAT / NPS: High (4)
- Support ticket volume: Moderate (3)
- Days since last purchase: Moderate (3)
- Contract renewal date: Moderate (3)
- Resolution time: Low (2)
- Average order value: Low (2)

## 3. Intelligence Planner — show each metric's weight
- For every metric card, display its current **weight/importance** (the saved level, or the default) — e.g. a small badge "Importance: Critical" plus a mini progress bar matching the onboarding control.
- Add a short note that importance is set during onboarding and drives the health score.

## Technical details
- **`src/lib/profile-store.ts`**: add `metricWeights?: Record<string, number>` to `OnboardingProfile`.
- **`src/lib/mock-data.ts`**:
  - Export `DEFAULT_METRIC_WEIGHTS` and the metric-name list.
  - Generate a `subScores: Record<string, number>` per base customer using the seeded RNG (replaces the single random `health`).
  - Add a pure `scoreCustomers(weights)` that returns the customer array with `health/risk/churnProbability/category/timeline` computed from `subScores` × weights.
  - Keep a default-weighted `customers`/`sortedByRisk` export (using `DEFAULT_METRIC_WEIGHTS`) for SSR and any non-reactive use.
- **New hook** `useScoredCustomers()` (in mock-data or a small new file): reads `useProfile()`, picks `metricWeights` or defaults, memoizes `scoreCustomers(weights)`. SSR-safe (profile is null on server → defaults).
- **Consuming routes** switch from the static `customers`/`sortedByRisk`/derived aggregates to the hook so scores react to saved weights: dashboard, customers index, customer detail, insights, and any health-distribution/at-risk aggregates. Aggregates (`healthDistribution`, counts, at-risk lists) become derived from the scored set inside those components.
- **`src/routes/_authenticated.onboarding.tsx`**: add the new step to `steps`, render the slider rows, manage `metricWeights` state initialized to defaults, include it in the `finish()` payload.
- **`src/routes/_authenticated.app.planner.tsx`**: read weights via `useProfile()` (fallback defaults) and render the importance badge + bar per card.

## Out of scope
- No backend schema changes; weights ride along in the existing localStorage + `saveProfile` profile payload.
- No new fonts or visual redesign; reuse existing tokens and the `chai` UI primitives.
