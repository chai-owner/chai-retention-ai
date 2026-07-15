## Plan: Enterprise navy / royal blue / gold rebrand

Premium B2B SaaS visual system (Stripe / Linear / Vanta feel). Presentation-only — no business logic changes.

### Design tokens (`src/styles.css`)

Replace current tokens with:

- `--background` `#F8FAFC` · `--card` `#FFFFFF` · `--border` `#E6ECF6`
- `--foreground` `#0F172A` · `--muted-foreground` `#475569` · a `--muted-foreground-2` `#64748B`
- `--primary` `#1E5ABA` (royal blue) · `--primary-hover` `#174B96` · `--primary-foreground` white
- `--navy` `#081D3A` (deep navy — hero, nav, footer surfaces)
- `--accent` `#F2C94C` (gold — sparingly)
- `--radius` `16px`
- `--shadow-soft` `0 10px 30px rgba(8,29,58,.08)` and a `--shadow-soft-lg` for hover lift
- `.dark` mapped to navy-dominant surfaces with the same accent hierarchy

All tokens as OKLCH via `@theme inline`. Remove existing amber/orange gradient tokens; add `--gradient-navy` (navy → slightly lighter navy) to replace orange glows.

### Typography (`src/routes/__root.tsx`)

Load Inter (400/500/600/700/800) via `<link rel="stylesheet">` on Google Fonts (with preconnect). Set `--font-sans: "Inter"`. Remove any prior display serif.

### Global components

- **Buttons** — primary: royal blue bg, white text, `rounded-[14px]`, medium weight, hover `#174B96` + soft shadow. Secondary: white bg, blue border + blue text, hover very light blue (`#F8FAFC` tinted).
- **Cards** — white, `rounded-2xl`, `--shadow-soft`, hover: small lift + thin blue border.
- **Icons** — outline style, royal blue stroke; occasional gold detail.

### Navigation (sticky)

Navy background, white logo wordmark with a small gold sparkle mark, white nav links (blue on active/hover), royal blue primary CTA, minimal bottom border.

### Hero

Keep existing layout. Navy `#081D3A` background. White headline with 1–2 gold accent words. White subhead at reduced opacity. Royal blue primary CTA + outlined white secondary CTA. Replace orange glow with subtle navy/blue radial gradient. Dashboard screenshot sits in a white card with `--shadow-soft`.

### Feature cards / sections

Alternate white and `#F8FAFC` section backgrounds for rhythm. Feature cards: white, subtle shadow, royal blue icons, optional tiny gold badge. Hover: lift + shadow bump + thin blue border. Generous vertical padding (increase section spacing ~20%).

### Dashboard mockups

Recolor charts and mock UI: royal blue primary, gold secondary, neutral gray fills. Remove amber/orange/green except for genuine status pills. Applies to hero preview and any in-page dashboard graphics.

### Footer

Deep navy bg, white headings, muted gray (`#94A3B8`) links with royal blue hover, gold accent on the logo mark.

### Audit pass

Grep and replace hardcoded `bg-amber-*`, `text-orange-*`, `bg-[#...]` chai/warm references across: `Navigation`, `HeroSection`, feature/testimonial/pricing sections, `Footer`, dashboard preview components, and any authenticated dashboard views. Route everything through the new semantic tokens (`bg-primary`, `text-primary`, `bg-card`, `border-border`, `text-muted-foreground`, `bg-[hsl(var(--navy))]`, `text-[hsl(var(--accent))]`).

### Animations

Keep to fade-in, small upward translate, button hover, card lift, smooth scroll. Remove any bounce/scale/spin.

### Verify

Load `/` and one authenticated page. Confirm: navy hero + white dashboard card, royal blue CTAs, gold used only as small accents, alternating section backgrounds, consistent radius + soft shadows, no residual amber/orange.