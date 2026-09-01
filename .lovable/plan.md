# Shared UI design-system pass

## Goal
Unify app controls, cards, tables, and settings forms around the agreed flat, border-led visual system while preserving existing behavior and semantic status colors.

## Implementation
1. **Shared primitives**
   - Set all button sizes to the 10px radius family and remove shadows from solid, destructive, outline, and secondary variants.
   - Update shared `Card` and `StatCard` shells to a 14px radius, border-only treatment with no top accent border or shadow.
   - Add optional `title` and `subtitle` rendering to shared `Card` without changing existing child-only usage.
   - Render `StatCard` icons in compact semantic tinted chips using existing teal/gold/danger/warning/success tokens only.
   - Reduce `ScoreBar` to a 4px, fully rounded track.

2. **Affected pages**
   - Update the Risk Center table shell to 14px and remove its shadow.
   - Update Insights recommendation and benchmark row radii to 10px.
   - Replace Settings’ local Card with the shared Card, retain its section spacing, set form controls to a 10px radius and a muted sand-tinted fill, and remove the duplicate implementation.
   - Keep Dashboard and customer-detail structure unchanged; verify shared-component changes render cleanly and health distribution keeps its existing semantic palette.

3. **Palette guardrail**
   - Audit `--chart-3` and `--chart-4` usage across app UI.
   - Preserve blue only for line/trend chart strokes and green only for the healthy segment of health-distribution visuals; do not introduce either into chips, badges, or buttons.

4. **Verification**
   - Run TypeScript typecheck, production build, and the full test suite.
   - Inspect Dashboard, Risk Center, customer detail, Insights, and Settings at desktop and mobile widths for layout regressions.

## Final values
- Buttons and inputs: 10px radius.
- Shared cards and Risk Center table shell: 14px radius.
- Stat icon chips: 30px square with an 8px radius.
- Score bars: 4px height, fully pill-shaped.
