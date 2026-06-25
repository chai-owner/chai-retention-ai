## Goal
Make the homepage images render sharp instead of fuzzy. The source screenshots are already high-resolution (~2300px wide and crisp), so the softness comes from how they're displayed — not the files. The main culprit is the hero's 3D rotation, which forces the browser to rasterize the screenshot at an angle and blurs all its text.

## Changes (all in `src/routes/index.tsx`)

### 1. Hero image — drop the 3D tilt, keep the peach frame
In the hero block (around lines 135–149):
- Remove the 3D transform classes from the frame wrapper: `[transform:rotateX(8deg)_rotateY(-12deg)_rotateZ(1deg)]` and the hover `hover:[transform:rotateX(4deg)_rotateY(-6deg)]`, plus the now-unneeded `[perspective:2000px]` / `will-change-transform`.
- Keep the peach gradient frame, glow blurs, ring, and rounded corners exactly as-is so the styling stays.
- Optionally add a very subtle flat lift on hover (e.g. `hover:-translate-y-1`) so it still feels interactive without rotating.
- Result: the dashboard screenshot displays flat and crisp inside the same peach frame.

### 2. Showcase images — prevent resampling softness
In the showcase map (around lines 202–210):
- Replace `object-cover` with natural block rendering (`w-full h-auto block`) so the image is shown at its true aspect ratio with no cropping/scaling resample.
- Add explicit `width`/`height` attributes matching each screenshot's real pixel size so the browser reserves correct space and downscales cleanly.

## Notes
- No screenshots need to be recaptured — the assets are already high-DPI and sharp.
- This is purely a presentation/CSS change to `index.tsx`; no data, asset, or logic changes.
</content>
<summary>Remove the hero's 3D tilt (keeping the peach frame) and clean up showcase image rendering so all homepage screenshots display crisp instead of fuzzy.</summary>
</invoke>
