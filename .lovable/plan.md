## Goal

On step 3 of onboarding ("The metrics ChAi will track for you"), let the user remove any of ChAi's suggested metrics and add their own custom ones. Whatever set they end onboarding with is what gets saved to their profile and drives scoring.

## UX

Each metric card gets a small "Remove" (X) button in the top-right, next to the importance badge. Clicking it drops the metric from the active set and clears its weight.

Below the list, a dashed "+ Add a metric" card opens a small inline form with:
- Name (required, short)
- Category (dropdown: Engagement, Transactions, Support, Satisfaction, Retention — defaults to Engagement)
- Description (optional, one line — becomes the metric's `why`)
- Importance slider (1–5, defaults to Moderate/3)

Save appends it to the active metric list with a "Custom" badge (instead of "ChAi recommended"), and clears the form. Cancel closes it.

Guardrails:
- Prevent duplicate names (case-insensitive) — inline error.
- Require at least 1 metric before allowing "Continue" on step 3.
- If the user removes everything, show a subtle "Add at least one metric to continue" hint.

Retry/regenerate behaviour is unchanged — regenerating replaces the AI-suggested metrics but keeps custom ones the user added.

## Technical details

File: `src/routes/_authenticated.onboarding.tsx`

- Promote the metric list from the derived `activeMetrics` const into real state: `const [metrics, setMetrics] = useState<PlannerMetric[]>([])`. `generateMetricRecommendations` sets it (merging: keep any metric whose name isn't in the AI response and was flagged custom; replace the rest).
- Track which metrics are custom via a `Set<string>` of names (or a `custom: true` flag on the metric object — easiest is a local `customMetricNames` set kept in state).
- Remove handler: filter `metrics` by name and delete the entry from `metricWeights` and `recommendedWeights`.
- Add handler: validate name uniqueness, push a new `PlannerMetric` (name, category, why, churn: "", weight, reason: "Added by you"), set its weight in `metricWeights`, and mark it custom.
- Continue button on step 3 is disabled when `metrics.length === 0`.
- Save flow (existing `saveProfile` call): already persists `metrics` and `metricWeights`; no server changes needed. The scoring engine already keys off `profile.metrics` via `useActiveMetrics`, so custom metrics flow through automatically.

No database, server function, or AI prompt changes are required.
