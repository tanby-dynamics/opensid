# Net-Worth / Cross-Account Dashboard

## Summary

Every dashboard tile today is scoped to one account. There is no single number that answers "how much do I have?". This feature adds a Net Worth tile (sum of balances across all accounts) with optional asset / liability grouping, plus a Net Worth Over Time chart. Both convert to the display currency from feature 08 when accounts have differing currencies, and both honour soft-deletes and transfers.

## Requirements

- New tile type: `net_worth` — large headline of total balance with optional breakdown by account
- New tile type: `net_worth_chart` — line chart of total balance over time (daily granularity, configurable window)
- Each account can be classified as **asset** (+) or **liability** (−); displays sum and per-group subtotal
- Tile honours display currency when accounts have differing currencies (feature 08)
- Optional account opt-out: an account can be flagged "exclude from net worth" (e.g. an external test account)
- Soft-deleted accounts excluded
- Backup/restore preserves account classification and exclusion flag

## Detailed description

### Schema

```sql
ALTER TABLE accounts ADD COLUMN kind TEXT NOT NULL DEFAULT 'asset'
    CHECK(kind IN ('asset','liability'));
ALTER TABLE accounts ADD COLUMN exclude_from_net_worth INTEGER NOT NULL DEFAULT 0;
```

Liability balances are still stored the same way (`amount_cents` signed); semantically a liability account holds debt (e.g. credit card). Convention: a liability with a negative net balance represents debt outstanding. The net-worth roll-up *subtracts* the absolute value of liability balances from total assets:

```
net_worth = SUM(asset_balances) - SUM(|liability_balances|)
```

Edge case: a liability with a positive balance (e.g. credit on a card) is added back as part of `SUM(asset_balances)` only if it is in the asset bucket. We keep this simple: liability accounts subtract their absolute balance from net worth. Documented in the tile's info-tooltip.

### Net-worth endpoint

`GET /api/net-worth?on_date?=YYYY-MM-DD`:

```json
{
  "as_of": "2026-05-28",
  "display_currency": "AUD",
  "total_cents": 23456700,
  "assets_cents": 30000000,
  "liabilities_cents": 6543300,
  "accounts": [
    { "id": 1, "name": "Everyday", "kind": "asset", "balance_cents_native": 12345, "currency": "AUD", "balance_cents_display": 12345 },
    { "id": 2, "name": "USD travel", "kind": "asset", "balance_cents_native": 50000, "currency": "USD", "balance_cents_display": 75000 },
    { "id": 3, "name": "Visa", "kind": "liability", "balance_cents_native": -120000, "currency": "AUD", "balance_cents_display": -120000 }
  ],
  "missing_rates": []
}
```

If a rate is missing for any account, that account is listed in `missing_rates` and excluded from totals; the tile shows a banner.

### Net-worth-over-time endpoint

`GET /api/net-worth/history?from=&to=`:

Returns one point per day in the range. Implementation: for each day, compute per-account balance as of that day (sum `amount_cents` for that account where `date <= day`), convert to display currency using the day-effective rate, sum with sign per `kind`. For a single-user app with ~10k transactions, an in-memory daily walk is fast enough. Cache by `(from, to, display_currency)` for the duration of a request.

### Tiles

**`net_worth` tile**:

- Headline `$XX,XXX.XX` in display currency
- Below: assets subtotal, liabilities subtotal
- Optional "Show breakdown" toggle expands per-account rows with native and display amounts
- Trend pill: change since 30 days ago (computed from `/history`)

**`net_worth_chart` tile**: like the existing balance chart but cross-account; uses the history endpoint. Supports the same time windows as other chart tiles (`30d` / `90d` / `1y` / `all`).

### Settings — account classification

Account form gains:

- **Kind**: Asset / Liability (default Asset)
- **Exclude from net worth**: checkbox

The Settings → Accounts list grows a Kind column.

### Soft-delete & transfers

- Soft-deleted accounts: excluded everywhere.
- Transfers (feature 04): both sides counted in the per-account balance; they don't double-count in the cross-account sum because one side is + and the other −.

### Backup

`BackupAccount` gains `kind` and `exclude_from_net_worth`. Default to `'asset'` and `0` for older backups.

## User stories

- As a user, I want a single net-worth number, so that I can see my position at a glance.
- As a user, I want my credit card balance to count as a liability, so that the total reflects what I actually own.
- As a user, I want to exclude play-money accounts, so that they don't skew the headline.
- As a user, I want a net-worth-over-time chart, so that I can see whether I'm trending up or down.

## Key decisions

| Decision | Outcome |
|----------|---------|
| Classification | A `kind` column on accounts — Asset or Liability |
| Liability roll-up | Subtract |liability balance| from net worth (documented in tooltip) |
| Display currency | Total in display currency (feature 08); accounts with no rate are listed and excluded |
| History granularity | Daily |
| Caching | Per-request memoisation only; no persistent cache (single-user scale) |
| Exclude flag | Per-account opt-out for play-money accounts |
| Trend pill | Compared against 30 days ago |

## Validation

| Rule | Error message |
|------|---------------|
| `kind` must be `'asset'` or `'liability'` | (enum) |
| `exclude_from_net_worth` must be 0 or 1 | (boolean) |

## Diagrams

```mermaid
flowchart LR
    A[Accounts] --> F{exclude_from_net_worth?}
    F -- yes --> X[Skip]
    F -- no --> C[Convert balance to display currency]
    C --> K{kind?}
    K -- asset --> S1[+ to assets_cents]
    K -- liability --> S2[- |balance| to liabilities_cents]
    S1 --> T[total = assets - liabilities]
    S2 --> T
```

## Acceptance criteria

```gherkin
Feature: Net worth dashboard

  Scenario: Single-currency net worth
    Given accounts Everyday (asset, $1,000), Savings (asset, $5,000), Visa (liability, -$500)
    When I view the net worth tile
    Then total reads $5,500 (assets $6,000 − liabilities $500)

  Scenario: Multi-currency net worth
    Given an AUD account at $1,000 and a USD account at $1,000
    And display currency = AUD, USD→AUD rate = 1.50
    When I view the net worth tile
    Then total reads AUD $2,500

  Scenario: Exclude play money
    Given an account flagged exclude_from_net_worth
    When I view the net worth tile
    Then its balance does not appear in the total

  Scenario: Missing rate banner
    Given a USD account with no USD→AUD rate available
    When I view the net worth tile
    Then a banner lists the missing rate
    And the USD account is excluded from the total

  Scenario: Net worth over time
    Given non-trivial transaction history
    When I view the net worth chart for the last 90 days
    Then a daily line is rendered with values matching the per-day balance sum

  Scenario: Trend pill
    Given net worth was $5,000 30 days ago and is $5,500 today
    Then the tile shows "+$500 (10%) vs 30 days ago"

  Scenario: Transfers don't double-count
    Given a $100 transfer between two assets
    Then the net worth total is unchanged

  Scenario: Soft-deleted accounts excluded
    Given a deleted account with a balance
    Then it does not appear in the breakdown or the total
```

## Manual test steps

1. Settings → Accounts. Confirm a Kind column and Exclude toggle per row.
2. Mark one account as Liability (e.g. "Visa"). Save.
3. Add a `net_worth` tile to the dashboard. Confirm the headline and assets/liabilities subtotals.
4. Toggle "Show breakdown"; confirm per-account rows with native and display amounts.
5. Flag a small play-money account as Exclude. Confirm it drops from the total and from breakdown.
6. Add a `net_worth_chart` tile; pick 90-day window; confirm a sensible line.
7. With multi-currency (feature 08), check the total renders in the display currency and missing rates surface in a banner.
8. Make a transfer between two assets; confirm the total doesn't change.
9. Soft-delete an account; confirm it disappears from the tile.

## Implementation tasks

1. **Schema**
   - [server/src/db.ts](server/src/db.ts) — add `kind` and `exclude_from_net_worth` columns on `accounts`.
2. **Repository**
   - [server/src/accounts/repository.ts](server/src/accounts/repository.ts) — read/write new columns; include in account responses.
   - New file: [server/src/net-worth/repository.ts](server/src/net-worth/repository.ts) — `getNetWorth(onDate)`, `getNetWorthHistory(from, to)`.
3. **Routes**
   - New file: [server/src/net-worth/routes.ts](server/src/net-worth/routes.ts) — `GET /api/net-worth`, `GET /api/net-worth/history`.
4. **Tile registration**
   - [server/src/dashboard-config/repository.ts](server/src/dashboard-config/repository.ts) — add `'net_worth'` and `'net_worth_chart'` to `TileType`; these tiles have no `account_id` (use 0 or NULL — schema change to allow NULL `account_id` for cross-account tiles).
5. **Client**
   - [client/src/api/dashboardConfig.ts](client/src/api/dashboardConfig.ts) — extend `TileType`.
   - New files: [client/src/components/NetWorthTile.tsx](client/src/components/NetWorthTile.tsx), [client/src/components/NetWorthChartTile.tsx](client/src/components/NetWorthChartTile.tsx).
   - [client/src/pages/Dashboard.tsx](client/src/pages/Dashboard.tsx) — render new tile types.
   - [client/src/components/AccountForm.tsx](client/src/components/AccountForm.tsx) — Kind select, Exclude checkbox.
6. **Backup**
   - `BackupAccount` gains `kind`, `exclude_from_net_worth`; defaults applied for older payloads.
7. **Tests**
   - Asset/liability arithmetic; exclusion; multi-currency conversion; transfer non-double-counting; history daily walk.
