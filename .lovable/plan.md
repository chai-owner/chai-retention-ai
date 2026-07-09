# Support ticket status tracking

Today, uploading support tickets only records file-level metadata (`UploadRecord`) — the actual ticket rows aren't kept, so re-uploading the same ticket just adds another upload entry. This adds a real ticket-level store that dedupes by `ticket_id`, overwrites an existing ticket when its status changes, logs every status change with a timestamp, and computes how long each ticket took to close. Results show both after a support upload and in a persistent section on the Data Quality page.

## Behavior

- On a **Support tickets** upload, each row is merged by `ticket_id`:
  - **New ticket_id** → inserted, first status recorded.
  - **Existing ticket_id, same status** → left as-is (no duplicate).
  - **Existing ticket_id, changed status** → the stored ticket is overwritten with the new status/fields, and a status-change event is appended to its history, timestamped at upload time.
- **Time-to-close** uses upload timestamps (per your choice): when a ticket flips to a closing status (`resolved` or `closed`), we record the close time as that upload's timestamp and compute duration from the ticket's `created_date` to that moment. Reopening (moving away from a closed status) clears the closed state so a later re-close recomputes.
- A short summary is produced per upload: tickets added, tickets updated, newly closed, reopened, and average time-to-close.

## Where it shows

- **After a support upload** (result panel in the upload wizard): "X new, Y updated, Z newly closed, avg time-to-close N days."
- **Data Quality page** — a new "Ticket status changes" section: a table of tracked tickets showing current status, a compact status-change timeline (status → status with dates), and resolution time for closed tickets.

## Technical details

**New file `src/lib/tickets-store.ts`**
- `useSyncExternalStore`-based in-memory store (same pattern as `uploads-store.ts`), keyed by `ticket_id`.
- `TicketRecord`: `ticket_id`, `customer_id`, `created_date`, `status`, `category`, `satisfaction_score`, `history: { status: string; at: string }[]`, `closedAt?: string`, `resolutionHours?: number`.
- Seed with a handful of demo tickets (including one with a resolved history and one reopened) so the Data Quality section isn't empty in the demo.
- `mergeTickets(rows: Record<string,string>[]): MergeSummary` — performs the dedupe/overwrite/history logic above and returns `{ inserted, updated, closed, reopened, avgResolutionHours }`. Closing statuses: `resolved`, `closed`. Timestamps use `new Date()` at merge time.
- `useTickets()` hook exporting the current list.

**`src/components/upload-wizard.tsx`**
- In `confirmAndSave`, when `dataset.key === "support"`, build mapped row objects (using the existing `mapping`/`headers`) and call `mergeTickets` before adding the `UploadRecord`.
- Add a lightweight `"done"` step (or inline result block) that renders the merge summary for support uploads; other datasets keep closing immediately as they do now.

**`src/routes/_authenticated.app.data-quality.tsx`**
- Add a "Ticket status changes" card (only meaningful when tickets exist) rendering the tracked tickets: current status badge, the status-change timeline from `history`, and resolution time for closed tickets. Read via `useTickets()`.

No backend/schema changes — this stays in the existing in-memory demo-store pattern used across the app.
