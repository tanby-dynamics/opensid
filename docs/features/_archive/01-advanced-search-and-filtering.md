# Advanced Search and Filtering

## Summary

The Account Detail page already supports keyword search across description/notes plus filters for date range, category, and type. This feature extends that with: (a) amount-range filters surfaced in the UI (already in the server repository), (b) an "Has attachment" toggle, (c) a "Recurring only" toggle, (d) inclusion of `category` in keyword matching, and (e) a new global search page that searches across **all** accounts at once. Together these turn a slow scroll-and-skim task ("that $40 hardware thing last March") into a single query.

## Requirements

- Surface `amountMin` / `amountMax` controls in the existing filter drawer on the Account Detail page
- Add a `hasAttachment` filter (yes / no / any) — server-side join against `attachments`
- Add a `recurringOnly` toggle — server-side filter matching template or generated transactions
- Extend keyword matching to include `category` (currently only `description` and `notes`)
- New **Search** page (`/search`) reachable from the top nav; searches across every account and renders results grouped by account
- Each result row links back to its account detail page with the matching transaction expanded
- Empty state ("No matches") and a clear-all-filters action on every filter surface

## Detailed description

### Server changes

[server/src/transactions/repository.ts](server/src/transactions/repository.ts) already accepts `TransactionFilters` with `keyword`, `from`, `to`, `category`, `type`, `amountMin`, `amountMax`. Extend it with:

```ts
export interface TransactionFilters {
    keyword?: string;
    from?: string;
    to?: string;
    category?: string;
    type?: 'income' | 'expense';
    amountMin?: number;
    amountMax?: number;
    hasAttachment?: boolean;
    recurringOnly?: boolean;
}
```

- `keyword` clause becomes `(description LIKE ? OR notes LIKE ? OR category LIKE ?)`
- `hasAttachment = true` adds `EXISTS (SELECT 1 FROM attachments a WHERE a.transaction_id = transactions.id AND a.deleted_at IS NULL)`; `false` adds `NOT EXISTS (...)`
- `recurringOnly = true` adds `(recurrence IS NOT NULL OR recurrence_source_id IS NOT NULL)`

Add a new global search endpoint:

```
GET /api/transactions/search?keyword=...&from=...&to=...&hasAttachment=...&...
```

It runs the same filter pipeline but without an `account_id` constraint, and includes `account_id` and `account_name` in each result row (JOIN on `accounts`).

### Client changes

#### Account Detail filter drawer

[client/src/pages/AccountDetail.tsx](client/src/pages/AccountDetail.tsx) — extend the existing collapsible filter drawer with three new controls:

- **Amount min / max** — two numeric inputs (dollars). Either may be blank.
- **Has attachment** — segmented control: `Any` / `Yes` / `No`.
- **Recurring only** — checkbox.

The "active filter count" badge above the drawer increments for each non-default value.

#### Global search page

New page at [client/src/pages/Search.tsx](client/src/pages/Search.tsx), routed at `/search`:

- Top: identical filter form to the Account Detail drawer, minus the per-account category typeahead (categories shown are union across accounts).
- Below: a list of `TransactionRow`s grouped by account, each group headed by the account name and a count.
- Clicking a row navigates to `/accounts/:accountId?expand=<txId>` — AccountDetail reads the `expand` query param and auto-expands that row on mount.
- A "Search" link is added to the top-nav in [client/src/components/Page.tsx](client/src/components/Page.tsx).

### Performance

SQLite without FTS is fine at this scale: `LIKE %x%` on description/notes/category for a single user with O(thousands) of rows is well under 50ms on commodity hardware. No FTS5 virtual table is introduced; if scale demands it later, the filter pipeline can be swapped behind the same `TransactionFilters` interface.

## User stories

- As a user, I want to search for transactions by amount range, so that I can find "that ~$40 thing" without remembering its description.
- As a user, I want to filter to transactions with attachments, so that I can review receipts at tax time.
- As a user, I want a global search across all my accounts, so that I don't have to repeat the same query in each account.
- As a user, I want a search result to take me directly to the matching transaction, so that I can edit it in context.

## Key decisions

| Decision | Outcome |
|----------|---------|
| Keyword scope | Extend existing `description LIKE ? OR notes LIKE ?` to include `category` |
| Attachment filter | Server-side `EXISTS` subquery against `attachments` (not a JOIN, to avoid duplicate rows) |
| Global search route | New page at `/search`, results grouped by account, link out to per-account view |
| Search index | Plain `LIKE` queries — no FTS5 — at single-user scale this is fast enough |
| Recurring filter semantics | True if either template (`recurrence IS NOT NULL`) or generated (`recurrence_source_id IS NOT NULL`) |
| Expand on navigate | `?expand=<txId>` query param on Account Detail auto-expands the matching row |

## Validation

| Rule | Error message |
|------|---------------|
| `amountMin` must be ≥ 0 if provided | "Minimum amount cannot be negative" |
| `amountMax` must be ≥ `amountMin` if both provided | "Maximum amount must be ≥ minimum" |
| `from` must be ≤ `to` if both provided | "From date must be before To date" |

## Acceptance criteria

```gherkin
Feature: Advanced search and filtering

  Scenario: Filter by amount range
    Given the account has transactions of $5, $40, and $500
    When I set amount min to 10 and amount max to 100
    Then only the $40 transaction is shown

  Scenario: Filter by has-attachment
    Given some transactions have attachments and some don't
    When I set the attachment filter to "Yes"
    Then only transactions with at least one non-deleted attachment are shown

  Scenario: Recurring only
    Given the account has both one-off and recurring transactions
    When I enable "Recurring only"
    Then only template and generated transactions are shown

  Scenario: Keyword matches category
    Given a transaction with category "Groceries" and description "Supermarket"
    When I search for "Groc"
    Then the transaction is included in results

  Scenario: Global search across accounts
    Given matching transactions exist in two accounts
    When I open the Search page and enter a keyword
    Then results are grouped by account with a count per group

  Scenario: Result links into account view
    Given a search result in account "Everyday"
    When I click the result
    Then I land on /accounts/<id>?expand=<txId> with that transaction expanded

  Scenario: Active filter badge
    Given I have set 3 filters in the drawer
    Then the filter button shows a badge "3"
    And clicking "Clear filters" resets all filters
```

## Manual test steps

1. Open an account with a mix of transaction amounts and categories.
2. Open the filter drawer. Confirm new fields: amount min, amount max, "Has attachment" (Any/Yes/No), "Recurring only".
3. Set amount min to a value above the smallest transaction; confirm small transactions disappear.
4. Set "Has attachment" to Yes; confirm only attached transactions show. Set to No; confirm the inverse.
5. Toggle "Recurring only"; confirm only recurring (template or generated) transactions remain.
6. Type a substring of a category name into the keyword box; confirm category matches appear.
7. Click "Clear filters"; confirm the list returns to default.
8. Open the **Search** page from the top nav. Enter a keyword that exists in multiple accounts; confirm results are grouped by account with counts.
9. Click a result; confirm you land on the account page with the matching transaction expanded.

## Implementation tasks

1. **Extend `TransactionFilters` (server)**
   - [server/src/transactions/repository.ts](server/src/transactions/repository.ts) — add `hasAttachment` and `recurringOnly`; extend keyword clause to include `category`.
2. **Update transaction routes to parse new filter params**
   - [server/src/transactions/routes.ts](server/src/transactions/routes.ts) — parse `hasAttachment` (`'true' | 'false'`) and `recurringOnly` (`'true'`) from query string and forward to the repository.
3. **Global search endpoint**
   - New file: [server/src/transactions/searchRoutes.ts](server/src/transactions/searchRoutes.ts) — `GET /api/transactions/search` mirrors the filter pipeline without `account_id`, returns rows joined with `accounts.name`.
   - Mount in [server/src/index.ts](server/src/index.ts) before `accountRoutes` to avoid conflict.
4. **Client API**
   - [client/src/api/transactions.ts](client/src/api/transactions.ts) — extend `TransactionFilters`; add `searchAll(filters)` calling the new endpoint.
5. **Account Detail UI**
   - [client/src/pages/AccountDetail.tsx](client/src/pages/AccountDetail.tsx) — extend the filter drawer with the new controls; read `?expand=<txId>` on mount and auto-expand the row.
6. **Search page**
   - New file: [client/src/pages/Search.tsx](client/src/pages/Search.tsx) — reuse a shared `FilterForm` component if extracted; group results by `account_name`.
7. **Nav link**
   - [client/src/components/Page.tsx](client/src/components/Page.tsx) — add "Search" entry to the top nav.
   - [client/src/App.tsx](client/src/App.tsx) — register the `/search` route.
8. **Tests**
   - Server: extend [server/src/transactions](server/src/transactions) tests with cases for `hasAttachment`, `recurringOnly`, and the global search route.
   - Client: tests for amount-range validation and "Clear filters" behaviour.
