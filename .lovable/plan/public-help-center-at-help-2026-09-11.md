# Public Help Center at /help

A public, no-login help section where articles live as markdown files, so you can add or edit content without touching code.

## What gets built

**Help index (`/help`)**
- All nine categories listed: Getting Started, Data & Integrations, How to Use ChAi, Understanding Your Risk Scores, Notifications & Reporting, Using Ask ChAi, Billing, Team & Organisation, FAQ & Troubleshooting.
- Each category shows its articles as a linked list with a one-line description.
- A search box at the top filters articles by title as you type; categories with no match hide.
- Brand styling: icy-blue page, navy headings, Teal Waters links, Spring Meadow accents, Plus Jakarta Sans (already the site font).

**Article page (`/help/<category>/<article-slug>`)**
- Renders the markdown: headings, bold/italic, lists, links, quotes, code, images.
- Video embeds: a YouTube, Vimeo, or Loom link on its own line becomes an embedded player.
- Breadcrumb back to the category and the help index.
- "Was this article helpful?" Yes / No buttons at the bottom. The click is captured in the page only (thank-you message shown), no data stored yet.
- Page title and meta description come from the article's frontmatter, plus canonical and social tags.

**Footer**
- A "Help" link added to the homepage footer.

## Adding content

Each article is one markdown file under `src/content/help/<category-slug>/<article-slug>.md`:

```text
---
title: Connecting your first integration
category: data-integrations
description: How to link Xero, HubSpot, Zendesk and more to ChAi.
order: 1
---

## Before you start
Write normal markdown here.

https://www.youtube.com/watch?v=xxxx
```

Drop a new `.md` file in the right folder and it appears on the index and gets its own page automatically. Category display names come from a small category list; the seed set ships with one starter article per category so every page is populated from day one.

## Technical notes

- Articles loaded with `import.meta.glob('../content/help/**/*.md', { query: '?raw', eager: true })` in `src/lib/help-content.ts`; a small frontmatter parser + slug derivation from the file path. No new runtime dependency for loading.
- Markdown rendered by a compact in-repo renderer (`src/lib/help-markdown.ts`) producing React nodes — no `dangerouslySetInnerHTML`, so no injection risk, and embeds are handled as a block type.
- Routes: `src/routes/help.index.tsx`, `src/routes/help.$category.$slug.tsx`, plus `src/routes/help.tsx` layout rendering `<Outlet />`. All public — outside `_authenticated`.
- Unknown slug throws `notFound()`; article `head()` supplies title/description/og/canonical.
- Unit tests for the frontmatter parser, article indexing, and the markdown/embed renderer.
