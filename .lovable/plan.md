# Content-based risk signals — phased plan

Your message cut off mid-point 1 ("VALIDATION GATE… ac"). This plan assumes the
validation gate as you described it and adds the other things a project this size
needs. Tell me the rest of your numbered points and I'll fold them in.

Nothing here is built yet. No code written.

## What exists today (the honest starting line)

- No free-text content is stored anywhere. Support connectors keep a ticket subject
  truncated to 60 characters; Zoho activities keep type, subject, owner, date, ID.
  Bodies are never fetched.
- "Competitor mentioned" and the signals panel on Insights are demo content, not
  generated from anything.
- Real risk factors come only from numeric metrics.
- AI is used today for summaries and metric suggestions — always from numbers.

So every phase below starts from zero on content. There is no pipeline to extend.

## Phase 0 — Validation gate (prove the mechanism, throw it away if it fails)

Covers: one source only (support conversations — the richest text), one connector
(whichever of Zendesk/Intercom/Freshdesk is connected and healthy), all four signal
types extracted by a language model over a sample of real conversations. Output is a
review screen for you, not a customer-facing feature: each detection shows the quote
it came from, the signal type, a date and a confidence, so you can mark it right or
wrong by hand.

Depends on: nothing.

Exit criteria before Phase 1 starts: agreed accuracy on your own labelled sample
(suggest ≥85% correct on direct dissatisfaction, ≥70% on circumstantial risk, and few
enough false positives that you'd trust a flag). If circumstantial risk is much weaker
than direct — likely — we can ship the two direct signals first and keep iterating on
the other two.

Effort: 1 week, plus your time labelling a sample.

## Phase 1 — Real pipeline on one support source

Covers: fetching and storing conversation bodies properly, incremental so we aren't
re-reading history every night; the extraction pass running on a schedule; storage for
extracted signals; the signal appearing on the customer page as a flag with its quote,
source and date. Not wired into the health score yet.

Depends on: Phase 0 passing the gate.

Also lands here because it can't be deferred: a retention and purge decision for
customer conversation text (how long we keep bodies, how an account deletes them), and
cost controls — only new/changed conversations go to the model, with a per-account
ceiling.

Effort: 2 weeks.

## Phase 2 — Remaining support sources

Covers: the other two support connectors on the same pipeline. Mostly fetch-layer work
per provider plus their own paging/incremental quirks; extraction and storage are
already built.

Depends on: Phase 1.

Effort: 1 week (roughly 2–3 days per connector).

## Phase 3 — Scoring and surfacing

Covers: content signals become real risk factors alongside metric-driven ones — a
weighting decision, how a signal decays with age, how it reads on the customer page and
the digest email, and the ability to dismiss a wrong flag so it stops counting.

Depends on: Phase 2 (or Phase 1, if you'd rather score one source early).

Effort: 1 week.

## Phase 4 — CRM sources

Covers: Zoho activity bodies (call description, note content, meeting agenda) added to
the fetch, flowing through the existing extraction. HubSpot and Salesforce follow the
same shape when they're live.

Depends on: Phase 3. Deliberately last — CRM call notes are often one-liners and carry
far less signal than support conversations.

Effort: 1 week for Zoho; ~3 days each for HubSpot and Salesforce once enabled.

## Phase 5 — Data Drop content

Covers: free text inside uploaded spreadsheets, and screenshots of emails read by a
vision model. This is a different technical problem from the rest — image reading,
messy layouts, and no reliable way to know which customer a screenshot belongs to
without asking the uploader.

Depends on: Phase 3.

Effort: 2 weeks, and the lowest confidence estimate in this plan.

## Totals

Direct-signal value on support conversations: ~4 weeks (Phases 0–1, plus Phase 3 if you
want it scoring). Everything including Data Drop: ~8–9 weeks. The original one-week
estimate covered only Phase 0.

## Open questions for you

1. The rest of your cut-off message.
2. Are you comfortable storing customer conversation text at all, or should we store
   only the extracted signal and the single quote it rests on?
3. Should a content signal move the health score, or only ever show as a flag?
4. Which support connector do you want Phase 0 run against?
