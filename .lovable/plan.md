## Goal

Produce a polished, non-technical PDF that explains what ChAi does, its feature set, and how it works end to end — suitable for sharing with prospects, investors, or new users.

## Content outline

1. **Cover page** — ChAi wordmark, tagline ("AI retention intelligence built for your industry"), date.
2. **What ChAi is** — 3-4 sentence plain-language overview: predicts which customers are about to leave, why, and what to do about it.
3. **How it works (4 steps)**
   - Tell ChAi about your business (onboarding profile: industry, model, customers, cadence, concerns)
   - ChAi picks your metrics (industry-specific health signals, you set the importance weight of each, remove ones that don't apply)
   - Bring in your data (integrations, AI data drop, or manual upload per metric)
   - Get scores, insights and actions (health score, churn risk, revenue at risk, recommended next steps)
4. **Feature list**, grouped:
   - Customer health & churn scoring (weighted, metric-driven, per-customer factors)
   - Dashboard (health distribution, revenue at risk, retention opportunity, accounts needing attention)
   - Customers & customer detail views
   - Risk Center / accounts needing attention with AI-written reasons
   - Churned & win-back analysis
   - Insights & benchmarks
   - Intelligence Planner (metric plan and actions)
   - Ask ChAi assistant (chat with your retention analyst)
   - Data Quality Engine (coverage, unmatched records + linking wizard, saved links, forget-a-customer, audit log)
   - Integrations (Salesforce, HubSpot, Zoho CRM, Zendesk, Intercom, Freshdesk, QuickBooks, Xero, FreshBooks) with daily incremental refresh
   - Manual uploads with per-metric templates
   - Security & privacy (per-account data isolation, encrypted connections, right-to-be-forgotten)
   - Admin & usage visibility
5. **What makes ChAi different** — industry-specific metrics rather than a generic template; you control the weights; explanations in plain language.
6. **Getting started** — short 3-line closing.

## Approach

- Verify the feature list against the actual app pages and onboarding flow before writing, so nothing is claimed that doesn't exist.
- Generate the PDF with ReportLab using the current brand palette (Product Navy `#152238`, Teal Waters `#204654`, Sand `#E0A93A`, Soft Sand `#F5F0E6`) and a Unicode-safe font.
- No invented metrics, customer names, or statistics — descriptive copy only.
- Render every page to images and visually QA (overflow, spacing, contrast, orphaned headings) before delivering.
- Deliver as a downloadable artifact: `chai-features-overview.pdf`.

## Notes

This is a one-off document, not an in-app page — no application code changes.
