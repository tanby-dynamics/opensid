# Tags

## Summary

Transactions today carry a single free-text `category`. That collapses cross-cutting concerns into one slot: a $90 lunch with a client is either "Dining" *or* "Work" *or* "Tax-deductible", but not all three. This feature adds many-to-many **tags** alongside category. Tags appear as chips on each transaction, are filterable in the existing filter drawer, and roll up in a new "Spend by tag" report.

## Requirements

- New `tags` table and a `transaction_tags` join table
- A transaction may have zero or more tags
- Tags are global (not per-account) and reused across the user's data
- Tag picker on the transaction form: typeahead with create-on-Enter
- Tag chips on the transaction row and in the expanded detail
- Filter by one or more tags in the Account Detail filter drawer and on the Search page
- "Spend by tag" report on the Reports/Settings area (or a new tile type later)
- Tags included in backup/restore
- Bulk-tag action on the existing bulk action bar

## Detailed description

### Schema

```sql
CREATE TABLE IF NOT EXISTS tags (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    colour     TEXT,                                    -- optional hex like '#7AB'
    created_at DATETIME NOT NULL DEFAULT (datetime('now')),
    deleted_at DATETIME
);
CREATE UNIQUE INDEX IF NOT EXISTS tags_name_unique
    ON tags(LOWER(name)) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS transaction_tags (
    transaction_id INTEGER NOT NULL REFERENCES transactions(id),
    tag_id         INTEGER NOT NULL REFERENCES tags(id),
    PRIMARY KEY (transaction_id, tag_id)
);
```

Tag names are case-insensitive unique. Soft-deleting a tag preserves history; the row stays in `transaction_tags` so backup/restore can round-trip but filters and pickers exclude it.

### API

- `GET /api/tags` — list non-deleted tags with `usage_count`
- `POST /api/tags` — `{ name, colour? }` — creates or returns existing (case-insensitive)
- `PUT /api/tags/:id` — rename / recolour
- `DELETE /api/tags/:id` — soft-delete
- `PUT /api/transactions/:id/tags` — `{ tag_ids: number[] }` — replaces the tag set on the transaction
- `POST /api/transactions/bulk-tag` — `{ transaction_ids: number[], add?: number[], remove?: number[] }`

Transaction response objects gain a `tags: { id, name, colour }[]` array. The repository performs a single follow-up query (`WHERE transaction_id IN (...)`) and stitches results, avoiding N+1.

### Filter integration

`TransactionFilters` (feature 01) gains `tagIds?: number[]` and `tagMode?: 'any' | 'all'` (default `'any'`). The repository translates these to `EXISTS` subqueries against `transaction_tags`. `'all'` is a multi-EXISTS form.

### Spend by tag report

A new section on the Settings/Reports page (or a future dashboard tile) shows totals per tag for a selectable date range and account scope (single account or all):

| Tag | Transactions | Total spent |
|-----|--------------|-------------|
| work | 12 | $1,240.00 |

Rows are sorted by total descending. Untagged transactions appear as a final "(untagged)" row.

### Backup

Backup payload adds `tags` and `transaction_tags` arrays. Merge import resolves tags by case-insensitive name; transaction IDs are remapped using the existing remapping logic.

## User stories

- As a user, I want to attach multiple tags to a transaction, so that "Work" and "Tax-deductible" both apply to the same lunch.
- As a user, I want to filter by tag, so that I can pull up every tax-deductible expense at year-end.
- As a user, I want to bulk-tag transactions, so that I can label a year of imports in one pass.
- As a user, I want a spend-by-tag report, so that I can see where my discretionary categories actually go.

## Key decisions

| Decision | Outcome |
|----------|---------|
| Tag scope | Global across all accounts (single-user app — no isolation gain from per-account) |
| Tag uniqueness | Case-insensitive unique by name (partial index excluding soft-deleted) |
| Category vs. tags | Both kept — category is the primary 1-of-N classifier, tags are cross-cutting |
| Filter "all" vs "any" | Default `any` (match if transaction has any of the selected tags); user can switch to `all` |
| Bulk operations | Add/remove sets per-transaction — additive, never destructive of unrelated tags |
| Colours | Optional hex; default chip styling if absent |
| Untagged rollup | Reports include an explicit "(untagged)" bucket |

## Validation

| Rule | Error message |
|------|---------------|
| `name` must be 1–40 characters | "Tag name must be 1–40 characters" |
| `name` must not contain commas | "Tag names cannot contain commas" |
| `colour`, if set, must be a 7-char hex `#RRGGBB` | "Colour must be a hex value like #7AB1FF" |
| Duplicate tag name (case-insensitive) | "A tag with this name already exists" (or returned by the create endpoint as the existing row, depending on caller) |

## Acceptance criteria

```gherkin
Feature: Tags

  Scenario: Create a tag from the transaction form
    Given I am editing a transaction
    When I type "work" in the tag picker and press Enter
    Then a new tag "work" is created and applied
    And the chip appears on the transaction row after save

  Scenario: Existing tag reused regardless of case
    Given a tag "Work" exists
    When I type "work" and press Enter on a new transaction
    Then the existing "Work" tag is applied (no duplicate created)

  Scenario: Filter by tag (any)
    Given transactions tagged with "work" and "personal"
    When I filter by tags [work] in 'any' mode
    Then only "work"-tagged transactions are shown

  Scenario: Filter by tag (all)
    Given a transaction tagged with both "work" and "tax-deductible"
    And another tagged with only "work"
    When I filter by [work, tax-deductible] in 'all' mode
    Then only the first transaction is shown

  Scenario: Bulk-tag transactions
    Given I have selected 5 transactions in the list
    When I open the bulk-action bar and apply tag "tax-deductible"
    Then all 5 transactions gain the tag without losing any existing tags

  Scenario: Soft-delete a tag
    Given a tag "old" applied to 3 transactions
    When I delete the tag
    Then it no longer appears in pickers or filters
    But the historical transactions still show it (greyed) until re-saved

  Scenario: Spend by tag report
    Given $400 of "work" expenses and $300 of "personal" expenses
    When I open Spend by tag for the current month
    Then I see rows: work $400, personal $300, and (untagged) for any unassigned

  Scenario: Backup round-trips tags
    When I export a backup and import on a fresh DB
    Then tags and their assignments to transactions are restored
```

## Manual test steps

1. Open a transaction. Confirm a "Tags" picker is present below Category.
2. Type "work" and press Enter; confirm a new chip appears. Save the transaction.
3. Open a different transaction; type "WORK"; confirm the existing tag is reused (no duplicate).
4. Apply two tags to one transaction. Save. Confirm both chips render on the row.
5. Open the filter drawer; pick one tag in "Any" mode; confirm only matching transactions appear. Pick two tags and switch to "All"; confirm only transactions with both tags show.
6. Select multiple transactions; from the bulk action bar choose "Add tag" and pick a tag. Confirm all chosen transactions gain it; existing tags are preserved.
7. Open Settings > Tags. Rename a tag; confirm chips update everywhere. Delete a tag; confirm it disappears from pickers but historical references still display until edits remove them.
8. Open the "Spend by tag" report; pick the current month; verify totals match a manual sum.
9. Export a backup and re-import on a clean DB; confirm tags and assignments restore.

## Implementation tasks

1. **Schema**
   - [server/src/db.ts](server/src/db.ts) — add `tags`, `transaction_tags`, and the case-insensitive partial unique index.
2. **Repository**
   - New file: [server/src/tags/repository.ts](server/src/tags/repository.ts) — CRUD, `findByTransactionIds`, `bulkSet(add, remove)`.
   - [server/src/transactions/repository.ts](server/src/transactions/repository.ts) — after fetching transactions, stitch tags via a single `IN (...)` query; extend `TransactionFilters` with `tagIds`, `tagMode`.
3. **Routes**
   - New file: [server/src/tags/routes.ts](server/src/tags/routes.ts) — endpoints listed above; mount in [server/src/index.ts](server/src/index.ts).
   - [server/src/transactions/routes.ts](server/src/transactions/routes.ts) — accept `tag_ids` on create/update; expose `PUT /:id/tags` and `POST /bulk-tag`.
4. **Client**
   - New file: [client/src/api/tags.ts](client/src/api/tags.ts).
   - New file: [client/src/components/TagPicker.tsx](client/src/components/TagPicker.tsx) — typeahead with create-on-Enter; multi-select.
   - [client/src/components/TransactionForm.tsx](client/src/components/TransactionForm.tsx) — render `TagPicker`.
   - [client/src/components/TransactionRow.tsx](client/src/components/TransactionRow.tsx) — render tag chips.
   - [client/src/components/BulkActionBar.tsx](client/src/components/BulkActionBar.tsx) — add Add tag / Remove tag actions.
5. **Tag management page**
   - New file: [client/src/components/settings/TagsSection.tsx](client/src/components/settings/TagsSection.tsx) — list, rename, recolour, delete; mount in Settings nav.
6. **Spend-by-tag report**
   - Server: `GET /api/reports/spend-by-tag?from=&to=&account_id=` aggregating cents per tag.
   - Client: new section on Settings/Reports.
7. **Backup**
   - [server/src/backup](server/src/backup) — include `tags` and `transaction_tags` arrays; merge by name and remapped transaction id.
8. **Tests**
   - Repository: any vs all filtering, case-insensitive dedupe, stitching avoids N+1.
   - Client: bulk-tag preserves existing tags.
