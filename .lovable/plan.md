## Goal
Replace the AI-generated 3D illustration in the homepage hero with a real, focused app screenshot, and remove the resulting duplication with the showcase section.

## Changes (`src/routes/index.tsx`)

1. **Hero image swap**
   - Capture a fresh, polished dashboard screenshot specifically framed for the hero (wider/landscape crop of the Executive Dashboard — top metric cards + health distribution + revenue-at-risk), upload via `lovable-assets`, and write the pointer to `src/assets/screenshots/hero-dashboard.png.asset.json`.
   - Point the hero `<img>` at this new screenshot, update `alt` text, and keep the existing soft gradient glow / rounded border / shadow frame so it still looks premium.
   - Remove the `heroDashboard` import and delete the unused generated illustration asset (`src/assets/hero-dashboard.jpg`).

2. **Remove showcase duplication**
   - Since the dashboard now anchors the hero, drop the first showcase entry ("Executive dashboard") from the `showcase` array so it no longer repeats lower down.
   - The showcase then leads with **Customer Risk Center**, followed by Insights & Benchmarks and Intelligence Planner. Existing alternating layout still works unchanged.

## Notes
- All screenshots are captured against the live preview with Playwright (authenticated session), consistent with prior homepage shots — tight, focused, high-DPI.
- No business-logic or backend changes; this is presentation only.

### Technical details
- Reuse the existing Playwright capture flow used previously for showcase shots; hero crop targets a landscape region (~16:10) of `/app/dashboard`.
- Asset handled through the `lovable-assets` CLI; only the `.asset.json` pointer is committed.
