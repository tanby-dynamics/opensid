# Smarter CSV Import

## Summary

The current CSV import accepts a file and inserts every row. Bank exports inevitably contain rows the user has already imported once and rows whose category should be obvious (e.g. anything containing "Woolworths" is Groceries). This feature extends the import flow with a **preview step** that highlights likely duplicates, lets the user skip or accept them, and **auto-suggests categories** by learning from the user's existing transactions. It does not replace the existing CSV import — it adds a smarter mode the user opts into.

## Requirements

- New "Preview" step between file upload and final import
- Duplicate detection: same `account_id`, `date`, `amount_cents`, and (case-insensitive) `description` matches a non-deleted existing transaction
- Per-row action in the preview: Import / Skip / Update existing
- Category suggestion: derived from existing transactions by description substring; surfaces the most-frequent category for descriptions sharing a token
- The user can edit category and description per row before confirming
- "Apply suggested categories" bulk action
- Summary counts at the top: imported / skipped / updated
- Backwards compatible: old endpoint still works for direct (no-preview) imports

## Detailed description

### Flow

1. User uploads CSV on the Import page (existing).
2. Server parses to a temporary in-memory representation, runs duplicate detection and category suggestion, and returns a **preview payload** without inserting anything.
3. Client renders the preview table.
4. User adjusts per-row decisions; submits.
5. Server applies decisions inside a single DB transaction.

### Endpoints

- `POST /api/accounts/:accountId/transactions/import/preview` — accepts the CSV multipart upload, returns a preview JSON payload. No DB writes.
- `POST /api/accounts/:accountId/transactions/import/commit` — accepts the user's adjusted preview JSON, applies it.

The existing `POST /api/accounts/:accountId/transactions/import` endpoint remains and is used by the "Quick import" path (skip preview).

### Preview payload

```json
{
  "rows": [
    {
      "row_index": 0,
      "date": "2026-05-12",
      "description": "WOOLWORTHS 1234",
      "amount_cents": -4523,
      "type": "expense",
      "suggested_category": "Groceries",
      "suggested_category_confidence": 0.92,
      "duplicate_of": 4711,
      "action": "skip"
    },
    { "row_index": 1, "date": "2026-05-13", "description": "Salary", "amount_cents": 250000, "type": "income", "suggested_category": null, "duplicate_of": null, "action": "import" }
  ],
  "summary": { "total": 50, "duplicates": 7, "categorised": 32 }
}
```

`action` defaults to:
- `'skip'` if `duplicate_of` is set
- `'import'` otherwise

### Duplicate detection

Inside a single account: a row is a duplicate of an existing transaction iff (`date`, `amount_cents`, `LOWER(description)`) match a non-deleted row. The first matching existing row wins; the row's `id` is exposed as `duplicate_of`.

Within the imported batch itself: rows that match each other on the same triple are flagged as `'duplicate_within_batch'` (only the first occurrence has `action='import'` by default, others `'skip'`).

### Category suggestion

A token-based suggester computed at request time (no model, no extra storage):

1. Build a map from (account, normalized-description-token) → most-common category from existing non-deleted transactions where category is set.
2. For each import row, tokenize the description (lowercase, split on non-alphanumeric, drop tokens < 3 chars), look up each token; pick the most-frequent category across matching tokens.
3. Confidence = (matches for chosen category) / (total token-category matches across all categories). If the top category has < 2 supporting transactions or < 0.5 confidence, return null and confidence 0.

Implementation can be a single SQL `GROUP BY` over `transactions` plus an in-memory aggregation. With small (< 10k rows) datasets this is < 50ms.

### Commit semantics

Server iterates the rows the client returns. For each:

| Action | Behaviour |
|--------|-----------|
| `import` | Insert as a new transaction with chosen category |
| `skip` | No-op |
| `update_existing` | Update `duplicate_of` with description, amount, category, type (date kept as the existing row's) |

All inside one DB transaction. Response: `{ imported, skipped, updated }`.

### UI

The Import page gets a new "Smart import" button alongside the existing one. After upload, the preview screen shows a sortable/filterable table:

| ✓ Action | Date | Description (editable) | Amount | Type | Category (editable, with suggestion chip) | Status |
|----------|------|-----------------------|--------|------|-------------------------------------------|--------|

Status chips: `Duplicate` (red), `Duplicate in batch` (amber), `New` (no chip).

Per-row action is a dropdown: Import / Skip / Update existing (only available when `duplicate_of` is set).

Top toolbar:
- Counts: "Importing X · Skipping Y · Updating Z"
- "Skip all duplicates", "Import all", "Apply suggested categories" buttons

Submit calls `commit` and shows a final toast with the counts.

## User stories

- As a user, I want a preview before I import, so that I can fix problems before they become noise in my transaction list.
- As a user, I want duplicates auto-flagged, so that re-importing a partly-overlapping bank export doesn't double-count.
- As a user, I want categories suggested from my history, so that I'm not categorising "Woolworths" by hand a hundred times.
- As a user, I want to update an existing row from an import row, so that the bank's more-detailed description replaces a placeholder I typed earlier.

## Key decisions

| Decision | Outcome |
|----------|---------|
| Two-step | Preview + commit endpoints; old endpoint stays for quick-import |
| Duplicate key | `(account_id, date, amount_cents, LOWER(description))` — strict but the user can override |
| Within-batch dupes | Detected and flagged separately; first row imports by default |
| Suggester | Token-based aggregation from the user's own transactions — no third-party model, no persistent state |
| Suggestion threshold | ≥ 2 supporting transactions and ≥ 0.5 confidence; otherwise no suggestion |
| Storage | Preview state lives on the client; commit re-sends the full decision payload |
| Backwards compatibility | Old import route preserved; Smart Import is opt-in |

## Validation

| Rule | Error message |
|------|---------------|
| Preview file required | "Choose a CSV file to import" |
| CSV must have at least the expected headers | "CSV is missing required headers: <list>" |
| `update_existing` requires `duplicate_of` to be set | "Cannot update — no matching transaction" |
| Row must have a description | "Row <n>: description is required" |

## Acceptance criteria

```gherkin
Feature: Smart CSV import

  Scenario: Duplicate flagged
    Given a transaction dated 2026-05-12, $45.23 expense, description "WOOLWORTHS 1234"
    When I preview a CSV containing the same date, amount, and description
    Then that row is flagged as a duplicate and its action defaults to "skip"

  Scenario: Within-batch duplicates
    Given two CSV rows with identical date, amount, and description
    When I preview the file
    Then the first row defaults to "import" and the second to "skip" with a "Duplicate in batch" chip

  Scenario: Category suggestion
    Given my history contains 5 transactions with "Woolworths" in the description categorised as "Groceries"
    When I preview a CSV row with description "WOOLWORTHS 9876"
    Then the suggested category is "Groceries"

  Scenario: No suggestion when evidence is weak
    Given a token has 1 supporting transaction with category "Groceries"
    When I preview a row matching that token
    Then no category is suggested

  Scenario: Bulk apply suggested categories
    Given 30 of 50 rows have suggested categories
    When I click "Apply suggested categories"
    Then all 30 rows' categories are set to their suggestions

  Scenario: Update existing
    Given a row is flagged as a duplicate of transaction #4711
    When I change its action to "Update existing" and adjust description
    And I commit
    Then transaction #4711 is updated to match the row's adjusted fields

  Scenario: Commit returns counts
    Given a preview with 50 rows: 40 import, 7 skip, 3 update
    When I commit
    Then the response reads { imported: 40, skipped: 7, updated: 3 }
    And the transaction list reflects the changes
```

## Manual test steps

1. Import a CSV once via Smart Import. Confirm preview displays, action defaults are correct, and counts make sense.
2. Re-import the same CSV. Confirm every row is flagged as a duplicate and defaults to Skip.
3. Add a row that matches another in the same CSV. Confirm "Duplicate in batch" chip and only the first auto-imports.
4. Pre-seed your history with 5+ rows whose descriptions include "Woolworths" categorised "Groceries". Import a new "WOOLWORTHS" row. Confirm Groceries is suggested.
5. Click "Apply suggested categories"; confirm categories populate.
6. Set one row to Update existing and adjust the description. Submit. Confirm the existing row is updated.
7. Confirm "Quick import" (the old endpoint) still works — no preview, direct import.

## Implementation tasks

1. **Preview & commit endpoints**
   - New file: [server/src/import/previewRoutes.ts](server/src/import/previewRoutes.ts) — wraps the existing parser plus duplicate detection and category suggestion.
   - [server/src/import/routes.ts](server/src/import/routes.ts) — add `commit` route.
2. **Duplicate detection**
   - New file: [server/src/import/duplicates.ts](server/src/import/duplicates.ts) — given parsed rows + account id, returns `duplicate_of` per row.
3. **Category suggester**
   - New file: [server/src/import/suggester.ts](server/src/import/suggester.ts) — token → category aggregate; pure function over an in-memory snapshot of transactions for the account.
4. **Client API**
   - [client/src/api/transactions.ts](client/src/api/transactions.ts) — `previewImport(file)`, `commitImport(payload)`.
5. **Preview UI**
   - New file: [client/src/pages/ImportPreview.tsx](client/src/pages/ImportPreview.tsx) — table with editable description and category, per-row action, status chips, bulk actions.
   - Route from the existing Import page's "Smart import" button.
6. **Edge cases**
   - Skipped rows whose category was edited do not consume the edit on commit.
   - Empty CSVs return an empty preview.
7. **Tests**
   - Server: duplicate detection (exact match, soft-deleted ignored, case-insensitive description), suggester threshold behaviour.
   - Client: bulk-apply, action-defaults logic.
