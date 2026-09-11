---
title: "What if my data is scattered and mismatched?"
category: data-integrations
slug: "what-if-my-data-is-scattered-and-mismatched"
description: "How ChAi matches scattered or inconsistently named customer records across your tools and what to do when automatic matching isn't possible."
order: 5
---

# What if my data is scattered under different identifiers?

It's completely normal for the same customer to appear differently across your tools. Your CRM might call them "Acme Corporation", your accounting software has them as "ACME", and your helpdesk knows them as "Acme Corp Ltd". ChAi handles this automatically.

## How ChAi matches customers across sources

When you connect multiple integrations or upload files, ChAi runs an identity resolution process to find and merge records that belong to the same customer. It works through a priority sequence:

**1. Email address** — the strongest signal. If two records share the same email, ChAi links them with high confidence.

**2. Shared ID** — if two sources use the same customer or account number, they're linked immediately.

**3. Email domain** — if records share the same company domain (e.g. both have `@acme.com`), ChAi treats them as the same organisation.

**4. Company name** — ChAi normalises names by removing suffixes like Ltd, Inc, Corp, and Pty, stripping punctuation, and comparing what's left. "Acme Corporation" and "Acme Corp Ltd" will match.

## What if ChAi can't find a match automatically?

If a customer has no overlapping identifiers across your sources — different email addresses, very different name spellings, no shared IDs — ChAi won't automatically link them.

In that case, open the customer detail page and look for the **Customer Identity** section. From there you can manually link a platform's ID to the correct customer record, and ChAi will merge all their data going forward.

## Why this matters for your health scores

The more sources ChAi can link to a single customer, the more accurate their health score becomes. A customer scored from CRM data only will show "Low confidence". The same customer scored from CRM, billing, and support data combined will show "High confidence" — and the churn probability will be much more reliable.

If you see low confidence scores across your customer base, it's often a sign that your data sources aren't being matched correctly. Check the Identity Resolution section on a few customer detail pages to see if manual linking would help.

## Messy data is welcome

You don't need to clean up your data before uploading it to ChAi. Inconsistent naming, duplicate records, and scattered identifiers are exactly what ChAi is built to handle. Upload what you have and let ChAi sort it out.
