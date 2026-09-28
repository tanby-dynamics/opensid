# Server-side pagination for Account Detail transactions

The Account Detail transaction table fetched the entire filtered result set client-side, which does not scale. We're adding server-side pagination (`LIMIT`/`OFFSET` on the existing deterministic `date DESC, id DESC` sort) with `page`/`pageSize` as URL query params (25/50/100 presets, default 50, server-clamped to 200) so pages are navigable and deep-linkable.

Because the client no longer holds the full result set, running balance and selection/filter totals move from client-side reduction to server-computed values returned alongside each page. Filters also move into the URL (not just page/pageSize) so a shared link fully reproduces what the sender saw; on load, URL params take precedence over the account's saved default view rather than the view auto-applying first. Changing any filter resets to page 1; an out-of-range page number is clamped to the last valid page rather than erroring. Row selection is scoped to the current page only — it does not persist across page navigation.

Two related surfaces are deliberately left unbounded and untouched by this change: the Reconciliation workflow (matching against a bank statement needs the full set) and the cross-account Search page (separate route, tracked as a follow-up). CSV export also stays unbounded — it applies filters but ignores page/pageSize, matching the existing "export everything matching my filters" expectation.

## Consequences

- The `?expand=<txId>` deep-link needs a server-side lookup to resolve which page a given transaction falls on (given current filters/sort/pageSize) before the client can navigate to it and expand the row — a new query, not just a client-side scan.
- `findByAccount` gains offset/count/running-balance support; the dashboard's fixed-limit caller (`RECENT_TRANSACTIONS_LIMIT`) and the CSV export path must not be changed to require pagination.
