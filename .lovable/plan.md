## Goal
Replace the "AI tokens" numbers on the admin page with a dollar cost, so the top stat and the per-customer column both read as USD.

## Approach
The `ai_usage_log` table stores `model`, `input_tokens`, `output_tokens` per row. Compute cost per row from a small pricing map (USD per 1M tokens), sum per user, and return dollars from the server function.

Currently the app only calls `google/gemini-3-flash-preview`, but we'll build a map that's easy to extend and falls back to a default rate for unknown models.

### Changes

1. `src/lib/admin.functions.ts`
   - Add a `MODEL_PRICING` map: `{ "google/gemini-3-flash-preview": { input: 0.30, output: 2.50 } }` (USD per 1M tokens; matches Gemini 3 Flash public pricing). Default fallback for unknown models.
   - In `listCustomers`, select `user_id, model, input_tokens, output_tokens` instead of `total_tokens`, compute `cost = input_tokens/1e6 * inRate + output_tokens/1e6 * outRate` per row, and sum per user.
   - Rename `totalTokens` on `AdminCustomer` to `totalCostUsd: number`.

2. `src/routes/_authenticated.admin.tsx`
   - Sum `totalCostUsd` instead of tokens.
   - Change the Stat label from "Total AI tokens" to "Total AI cost" and format as `$X.XX` (use `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`; show 4 decimals when total < $1 for readability).
   - Change the table column header "AI tokens" -> "AI cost" and format the cell the same way.

No schema changes, no new dependencies.
