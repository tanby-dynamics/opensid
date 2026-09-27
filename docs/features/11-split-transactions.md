# Split Transactions

## Summary

A single supermarket receipt might be $200 total but include $150 of groceries and $50 of cleaning supplies. Today the user must either pick one category (losing information) or create two transactions (losing the reality of one charge). This feature lets the user **split** a transaction into multiple children that sum to the parent amount. The parent represents the actual ledger entry; children only exist for categorisation and tagging. Reports and budgets read from children where present.

## Requirements

- A transaction may be split into 2+ children, each with its own amount, category, tags, and notes
- Children's amounts must sum to the parent's `amount_cents` (signed)
- The parent's `category` becomes `(split)` and its children carry real categories
- Reports (category chart, budgets, spend-by-tag) read children when present, parent otherwise
- The transaction row shows "split into N parts" with an expand affordance to view children
- A split can be unsplit (children deleted, parent restored to a single transaction)
- One attachment set lives on the parent; children share it
- Backup/restore preserves the parent/child relationship

## Detailed description

### Schema

Children are stored in `transactions` itself, linked back to the parent:

```sql
ALTER TABLE transactions ADD COLUMN split_parent_id INTEGER REFERENCES transactions(id);
CREATE INDEX IF NOT EXISTS transactions_split_parent_id
    ON transactions(split_parent_id) WHERE split_parent_id IS NOT NULL;
```

- A child has `split_parent_id` set; its `account_id`, `date`, `type` match the parent.
- A child's `amount_cents` is signed; sum across siblings must equal the parent's `amount_cents`.
- A parent (with at least one non-deleted child) is identified by `EXISTS (SELECT 1 FROM transactions c WHERE c.split_parent_id = parent.id AND c.deleted_at IS NULL)`.
- Children's `attachments` are not created; the parent's attachments are shown on the children's detail.

### Endpoints

- `POST /api/transactions/:id/split` — `{ splits: [{ amount, category, tags, notes }] }` — validates the sum and creates the children inside a transaction.
- `PUT /api/transactions/:id/split` — replace the children set entirely (server diffs and applies inserts/updates/deletes).
- `DELETE /api/transactions/:id/split` — soft-deletes all children; the parent becomes a normal transaction again. The parent's category is preserved if set, else "(uncategorised)".

### Balance and totals

Account balance still sums parent `amount_cents` only (children are *not* added to the parent, double-counting). The repository's existing balance query unchanged. Reports change as follows:

| Aggregation | Source |
|------------|--------|
| Account balance | Parent only (sum of `amount_cents`) |
| Category chart | Children where present, parent otherwise |
| Budget progress | Same — read children when parent has them |
| Spend by tag | Same |
| Income vs Expense chart | Parent only (children share type and sign by construction) |
| Net worth | Parent only |
| Forecast | Parent only |

Implementation: replace the "transactions ledger" view in reporting queries with a SQL view (or a CTE) that returns children when present and parents otherwise:

```sql
WITH reporting_rows AS (
  SELECT * FROM transactions WHERE deleted_at IS NULL AND split_parent_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM transactions c WHERE c.split_parent_id = transactions.id AND c.deleted_at IS NULL)
  UNION ALL
  SELECT * FROM transactions WHERE deleted_at IS NULL AND split_parent_id IS NOT NULL
)
```

### UI

**TransactionForm** gains a "Split transaction" toggle (visible after the amount is entered). When enabled:

- A dynamic list of split rows: amount + category + tag picker + notes.
- A live "Remaining: $X.XX" indicator; Save is disabled while non-zero.
- An "+ Add split" button; minimum two rows.
- A "Distribute remaining evenly" helper.

The form posts the parent normally then `POST /split` with the children. (Or, server-side: accept `splits` array on transaction create and do both atomically.)

**TransactionRow** changes:

- A parent row shows "Split into N" chip; expanding it shows children inline.
- A child is not rendered at the top level (deduped via the reporting CTE in list queries too, or filtered client-side).

**Bulk-action bar**: when a single parent transaction is selected, an "Unsplit" action is available.

### Recurrence interaction

A recurring template can be split. When the cron job generates an occurrence, it copies both the parent and its children (children's `split_parent_id` re-pointed to the new occurrence). The recurrence service iterates the children once per generation. Editing the template's splits affects future occurrences only (because past generated rows are independent).

### Backup

`BackupTransaction` already encodes all transaction columns; adding `split_parent_id` is sufficient. Merge import remaps parent IDs.

## User stories

- As a user, I want to split a $200 supermarket receipt into $150 Groceries and $50 Household, so that my categories reflect reality.
- As a user, I want my budgets to use the split amounts, so that a single combined charge counts properly against each budget.
- As a user, I want one attachment (the receipt) shared by all children, so that I don't upload it twice.
- As a user, I want to unsplit a transaction, so that mistakes are reversible.

## Key decisions

| Decision | Outcome |
|----------|---------|
| Modelling | Children live in `transactions` with `split_parent_id` |
| Balance impact | Parent only — children do not add to balance |
| Report aggregation | Children where present, parent otherwise — via a reporting CTE |
| Attachments | One set on the parent; children show it but cannot have their own |
| Sum invariant | Children must sum to parent's `amount_cents` (signed); enforced in app + integration test |
| Unsplit | Soft-deletes children; parent stays |
| Recurrence | Splits replicate per occurrence |

## Validation

| Rule | Error message |
|------|---------------|
| At least 2 children when splitting | "A split needs at least 2 parts" |
| Sum of children = parent amount | "Splits must sum to $X.XX (off by $Y.YY)" |
| Each child amount has the same sign as the parent | "Each split must be on the same side (income/expense) as the parent" |
| Child amount > 0 | "Amount must be greater than zero" |
| Cannot split a child | "This transaction is already a split — split its parent instead" |

## Acceptance criteria

```gherkin
Feature: Split transactions

  Scenario: Create a split on a new transaction
    Given I am creating an expense of $200
    When I split it: $150 Groceries, $50 Household
    Then the parent saves with amount=$200, category=(split)
    And two children exist with the listed amounts and categories
    And the children sum to the parent amount

  Scenario: Sum must match
    When I attempt to save a split with children summing to $190 against a parent of $200
    Then I see "Splits must sum to $200.00 (off by $10.00)"

  Scenario: Category chart aggregates by children
    Given a split parent of $200 into Groceries $150 and Household $50
    When I view the category chart for the period
    Then Groceries shows $150 and Household $50 (not "(split)" $200)

  Scenario: Budget progress reads children
    Given a Groceries budget of $300 and a split with $150 Groceries
    When I view the budget tile
    Then $150 counts against the Groceries budget

  Scenario: Account balance unchanged
    Given the only transaction is a $200 split
    Then the account balance reflects $200 (not $400)

  Scenario: Unsplit restores the parent
    Given a split exists
    When I unsplit
    Then children are soft-deleted
    And the parent remains as a normal transaction

  Scenario: Attachment shared across children
    Given a parent has 1 receipt attachment
    When I view a child's detail
    Then the receipt is visible

  Scenario: Recurrence preserves splits
    Given a monthly recurring split parent
    When the cron job generates an occurrence
    Then the generated row has children with the same allocation
```

## Manual test steps

1. Create a new expense of $200. Enable "Split". Add two rows: $150 Groceries, $50 Household. Confirm Remaining shows $0 and Save is enabled.
2. Save. Confirm the parent row shows a "Split into 2" chip.
3. Expand the row. Confirm the children appear inline with their categories.
4. Open the category chart for this month. Confirm Groceries shows $150 and Household $50.
5. Set a Groceries budget. Confirm the $150 child counts toward it.
6. Confirm the account balance increased only by $200 (not $400).
7. Attach a receipt to the parent. Open one of the children. Confirm the same receipt is visible.
8. Unsplit the transaction. Confirm children vanish; the parent stays with the original $200.
9. Make a recurring split. Wait for / trigger the cron run. Confirm a generated occurrence has the same split allocation.

## Implementation tasks

1. **Schema**
   - [server/src/db.ts](server/src/db.ts) — `ALTER TABLE transactions ADD COLUMN split_parent_id`.
2. **Repository**
   - [server/src/transactions/repository.ts](server/src/transactions/repository.ts) — `splitTransaction(id, children)`, `unsplit(id)`, `replaceSplits(id, children)`; `findByAccount` excludes children (`split_parent_id IS NULL`); add `findChildren(parentId)`.
3. **Reporting CTE**
   - New file: [server/src/reporting/view.ts](server/src/reporting/view.ts) — SQL string `reportingRowsCTE` reused by chart/budget/tag/category queries. Refactor [server/src/chart/repository.ts](server/src/chart/repository.ts), [server/src/budgets/repository.ts](server/src/budgets/repository.ts), [server/src/dashboard/routes.ts](server/src/dashboard/routes.ts) to use the CTE.
4. **Routes**
   - [server/src/transactions/routes.ts](server/src/transactions/routes.ts) — `POST /:id/split`, `PUT /:id/split`, `DELETE /:id/split`. Accept `splits` on the regular create endpoint too.
5. **Recurrence**
   - [server/src/recurrence/service.ts](server/src/recurrence/service.ts) — when generating an occurrence, copy children with re-pointed `split_parent_id`.
6. **Client**
   - [client/src/components/TransactionForm.tsx](client/src/components/TransactionForm.tsx) — Split toggle, dynamic rows, Remaining indicator, evenly-distribute helper.
   - [client/src/components/TransactionRow.tsx](client/src/components/TransactionRow.tsx) — split chip + expandable children panel.
   - [client/src/components/BulkActionBar.tsx](client/src/components/BulkActionBar.tsx) — Unsplit action (single selection).
7. **Attachments**
   - [client/src/components/AttachmentManager.tsx](client/src/components/AttachmentManager.tsx) — when viewing a child, show parent's attachments and disable upload (parent only).
8. **Backup**
   - Include `split_parent_id` in `BackupTransaction`; merge import remaps after parent IDs are mapped.
9. **Tests**
   - Sum invariant, balance non-double-count, reporting CTE returns children-or-parents, recurrence replication, unsplit reversibility.
