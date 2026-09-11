---
title: How health scores work
category: risk-scores
description: What the 0-100 health score and churn probability mean, and how ChAi calculates them.
order: 1
---

Every customer gets a **health score** from 0 to 100 and a **churn probability** percentage, refreshed nightly.

## The score

ChAi picks the metrics that matter for your business during onboarding — things like purchase frequency, support ticket volume, payment behaviour or usage. Each metric is normalised, weighted by how strongly it predicts churn in your data, and combined into a single score.

## The bands

- **Healthy (70-100)** — behaving normally, low risk
- **Watch (50-69)** — early drift worth a light touch
- **At risk (30-49)** — clear negative signals, act this week
- **Critical (0-29)** — likely to leave without intervention

## Churn probability

This is the modelled chance the customer leaves in the coming period, shown alongside the revenue at stake so you can prioritise by money, not just by risk.

## Confidence

Each score carries a confidence note. Thin or stale data lowers confidence — ChAi will tell you when that is the case rather than pretending the number is solid.
