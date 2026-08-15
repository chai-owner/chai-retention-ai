# Let users name their own metrics during onboarding

Today ChAi generates the whole metric set on the "What matters" step and the user can only re-weight or delete. This adds the user's own wishes into that set.

## What changes

**1. Ask up front (business-profile step)**
Add an optional free-text question: "Anything specific you already want to track?" with a hint like "e.g. missed appointments, repeat orders, support response time". Comma-separated or free prose is fine.

That answer is sent to ChAi with the rest of the profile, and the prompt instructs it to include those metrics in the returned set (cleaned up and named properly, with a category, why/churn explanation and a suggested weight) alongside the ones it picks itself.

**2. Add your own on the metrics step**
On the "The metrics ChAi will track for you" step, add an "Add a metric" row: type a name, press Add. It joins the list with a default weight of Moderate (3) and a "Your metric" badge instead of "ChAi recommended". These are removable like the rest; the minimum of 4 still applies, and the list caps at 12 so scoring stays meaningful.

User-added metrics flow through the existing pipeline unchanged — they get saved to the profile, appear in the Intelligence Planner, and generate their own CSV upload template / dataset like ChAi's metrics do.

## Technical notes

- `src/routes/_authenticated.onboarding.tsx`: new `mustTrack` field in `form`, rendered on the profile step; new `addMetric(name)` handler with duplicate-name guard and cap; badge branching on whether the metric came from ChAi (`recommendedWeights` has the key) or the user.
- `src/lib/ai.functions.ts`: extend `RecommendMetricsInput.profile` with optional `mustTrack`, include it in `profileLines`, and add a prompt clause requiring those metrics be represented in the output.
- `src/lib/profile-store.ts` / `src/lib/profile.functions.ts`: persist `mustTrack` on the profile so it survives re-runs and settings edits (the `metrics` array already persists, so user-added metrics carry over without further change).
- No database migration needed: `mustTrack` is stored alongside the other profile answers.
