# Content-based risk signals — phased plan

Planning only. No code written.

## Starting line (verified, not assumed)

- No free-text content is stored anywhere today. Support connectors keep a ticket
  subject truncated to 60 characters; Zoho activities keep type, subject, owner, date
  and ID. Bodies are never fetched.
- "Competitor mentioned" and the Insights signals panel are demo content.
- Real risk factors come only from numeric metrics. No keyword matching, no model
  reading customer text anywhere in the product.
- One thing to flag before we plan around it: the "Forget a customer" control on the
  Data Quality page is presentational — it shows a success toast and logs nothing. There
  is no erasure mechanism behind it. Point 5 below therefore starts by building the
  thing we currently only claim to have.

Every phase below starts from zero on content.

## Connector readiness (your point 3)

Zendesk and Freshdesk are both treated as **not confirmed working**. No content work is
scheduled against either until basic Connect + Sync is retested end to end. Intercom is
the only support connector with a proven path, so it is the Phase 0 candidate. If the
Zendesk retest passes before Phase 0 starts, Zendesk is the better subject — richer
ticket threads — and we swap.

Readiness retest (Zendesk + Freshdesk Connect/Sync, no content): half a day each, and
a prerequisite for Phase 2, not for Phase 0.

## Phase 0 — Validation gate (your point 1)

**Source:** one support connector only (Intercom, or Zendesk if retested in time).
Support conversations carry far more usable language than CRM call notes, so accuracy
measured here is the best available proxy for the mechanism itself.

**Covers:** fetch a sample of real conversation bodies (read-only, sample not sync),
run one extraction prompt over them for all four signals, and put the results on an
internal review screen: signal type, the verbatim quote, date, confidence. You label
each one right or wrong. Nothing customer-facing, nothing scored, nothing stored
long-term.

**Gate — measured on a labelled sample of at least 200 conversations spanning at least
20 accounts, including conversations with no signal at all:**

| Metric | Direct signals (competitor, cancellation intent) | Circumstantial (champion departure, company distress) |
|---|---|---|
| Precision (of flags raised, share correct) | ≥ 90% | ≥ 75% |
| Recall (of real signals, share caught) | ≥ 70% | ≥ 50% |
| False positives per 100 conversations | ≤ 2 | ≤ 5 |

Precision is weighted above recall deliberately: a missed signal costs nothing the
product doesn't already lack; a wrong flag on a healthy account destroys trust in
everything else on the page.

**Outcome rules.** Both categories pass → Phase 1 covers all four signals. Direct passes
and circumstantial fails → Phase 1 ships the two direct signals only, and
circumstantial returns to Phase 0 later as its own gate. Direct fails → stop. Do not
spend Phase 1 money on a mechanism that can't clear its own bar.

**Depends on:** nothing.
**Effort:** 1 week build and run, plus roughly half a day of your labelling time.

## Phase 1 — Real pipeline, one support source

**Covers:** fetching and storing conversation bodies incrementally; scheduled extraction
over new and changed conversations only; a store for extracted signals; the signal shown
on the customer page as a flag with its quote, source and date; dismiss-as-wrong. Not
wired into the health score yet.

Also lands here because it cannot be deferred: the erasure mechanism (see point 5), the
retention window for bodies, and the per-account cost ceiling.

**Source-agnostic by construction (confirmed decision).** Two things are explicit Phase 1
deliverables, not byproducts of building the first connector:

1. **A written adapter interface.** One documented contract every source implements:
   fetch conversations for an account since a cursor and return them in one normalised
   shape (`source`, `external_id`, `customer_ref`, `subject`, `body`, `occurred_at`).
   Everything downstream — storage, pre-filter, extraction, signal store, UI, erasure,
   cost ceiling — is written against that shape and never against Intercom's. Adding
   Zendesk, Freshdesk, Zoho or Data Drop later means writing one adapter and registering
   it, with no change to the pipeline. The interface lands with a registry and at least
   one adapter (Intercom), and the pipeline is unit-tested against a fake adapter to
   prove no provider-specific assumption leaked in.
2. **Conversation bodies get their own table**, separate from the existing
   subject/status/dates support table. The existing table stays exactly as it is —
   metrics and Data Quality keep reading it untouched. Bodies are keyed by
   `(source, external_id)`, so re-fetching updates in place, and carry their own
   90-day retention and their own erasure sweep.

**Depends on:** Phase 0 gate met.
**Effort:** 2.5 weeks (2 weeks pipeline, half a week erasure).

## Phase 2 — Remaining support sources

**Covers:** the other two support connectors onto the same pipeline. Fetch-layer work per
provider plus their paging and incremental quirks; extraction, storage and UI already
exist.

**Depends on:** Phase 1, and each connector's basic sync confirmed working first
(Zendesk, Freshdesk — point 3). A connector that fails its readiness retest simply
doesn't enter this phase.

**Effort:** 1 week (2–3 days per connector), excluding readiness fixes.

## Phase 3 — Scoring and surfacing

**Covers:** content signals become real risk factors alongside metric-driven ones —
weighting, decay with age, presentation on the customer page and in the weekly digest,
and a dismissal that actually removes the signal's score contribution.

**Depends on:** Phase 1 at minimum; better after Phase 2, when volume is representative.
**Effort:** 1 week.

## Phase 4 — CRM sources

**Covers:** Zoho activity bodies (call description, note content, meeting agenda) added
to the existing activities fetch, flowing through the same extraction. HubSpot and
Salesforce follow the same shape when live.

Deliberately after support: CRM notes are often one-liners, and extraction quality per
unit of text is materially worse. Expect the Phase 0 gate to be re-measured on a Zoho
sample before this goes live — a small gate, not a full phase.

**Depends on:** Phase 3. Salesforce also depends on it leaving "Coming soon".
**Effort:** 1 week for Zoho; ~3 days each for HubSpot and Salesforce once enabled.

## Phase 5 — Data Drop, its own track (your point 2)

Scoped separately because it shares almost nothing with the phases above. Two
sub-tracks, each with its own accuracy risk:

**5a — Spreadsheets with free text.** A column of notes or feedback in an uploaded
sheet. Structurally easy to read, but nothing tells us which column carries meaning or
which customer a row belongs to — that needs a mapping step in the upload flow, same
family as the existing column mapping. Extraction itself reuses Phase 1.
Effort: 1 week.

**5b — Screenshots.** A different pipeline end to end: a vision-capable model reads the
image, and the failure modes are new — unreadable crops, cut-off threads, no reliable
way to know which customer an email screenshot concerns without asking the uploader.
This needs its own validation gate before build, on the same precision-first terms as
Phase 0, and I'd expect weaker numbers than the API-sourced text. It is also the most
expensive per item.
Gate + build effort: 2 weeks, and the lowest-confidence estimate here.

**Depends on:** Phase 3 (so extracted signals have somewhere to land).
**Effort:** 3 weeks across both sub-tracks.

## Cost at scale (your point 4)

Rough, per account per month, at current gateway pricing. The driver is volume of text
read, and the pipeline only reads new or changed content after the first backfill.

| Phase | What's read monthly | Typical account | Heavy account |
|---|---|---|---|
| 1 (one support source) | ~200 conversations | $0.15–0.40 | $1.50 |
| 2 (all support) | ~500 conversations | $0.40–1.00 | $4 |
| 4 (+ CRM activities) | +300 short notes | $0.55–1.30 | $5 |
| 5 (+ Data Drop, screenshots) | +100 images | $1.50–3.00 | $10–15 |

First-sync backfill is a one-off multiple of these — cap it (say, last 90 days of
conversations) rather than reading a customer's entire history.

At Core $99 this is well inside the margin at every phase except a heavy account on
screenshots. Two controls worth building in Phase 1: a per-account monthly ceiling that
pauses extraction and tells the account owner, and a cheap pre-filter so obviously
signal-free short messages ("thanks!", auto-replies) never reach the model — that alone
typically removes 30–50% of the spend.

## Storage and deletion (your point 5)

Accounted for in every phase, and the design is the same each time:

- Store the extracted signal, its date, its confidence, and one short verbatim quote.
  The quote is what makes a flag trustworthy, so it has to persist.
- Keep source bodies only as long as needed for re-extraction — proposed 90 days, then
  drop the body and keep the signal.
- Erasure by customer removes every body, every extracted signal and every quote tied to
  that customer, while aggregate scores and historical trends stay intact — the same
  "delete the person, keep the insight" shape as the rest of the product.
- Because that mechanism doesn't exist yet, Phase 1 builds it for real, and each later
  phase extends it to its own new store (CRM notes in Phase 4, uploaded files and images
  in Phase 5) as part of that phase, not as follow-up work. A phase isn't done until its
  content is erasable.

The screenshots in Phase 5 deserve an explicit decision from you: they may contain third
parties who never dealt with your customer at all.

## Totals

| Milestone | Cumulative |
|---|---|
| Mechanism proven or abandoned (Phase 0) | 1 week |
| Flags live on one support source (Phase 1) | 3.5 weeks |
| All support sources, scored (Phases 2–3) | 5.5 weeks |
| CRM included (Phase 4) | 6.5 weeks (+ ~1.5 for HubSpot/Salesforce) |
| Full vision including Data Drop (Phase 5) | ~9.5 weeks |

Plus Zendesk/Freshdesk readiness retests before Phase 2, and ongoing model cost per the
table above. The original ~1 week estimate covered Phase 0 alone.

## Decisions I need from you

1. Greenlight Phase 0 only, or Phases 0–1 contingent on the gate?
2. Are the gate thresholds the right bar, or would you set precision higher still?
3. Comfortable storing conversation bodies for 90 days, or signal-plus-quote only from
   the start?
4. Should a content signal move the health score (Phase 3), or only ever show as a flag?
