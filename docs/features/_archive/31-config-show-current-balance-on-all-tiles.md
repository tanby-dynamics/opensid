# Add flag to show current balance at the top of dashboard tiles

## Summary

Add a per-tile toggle that lets users show the account's current balance at the top of a tile. The option is available only for **Transactions** and **Balance over time** tile types. For backwards compatibility, all existing Transactions tiles default to `show_balance = true`; new tiles of any type default to `false`. Users can toggle the setting per tile in Dashboard Settings.

## Detailed description

### Scope

The `show_balance` flag is supported on two tile types:

- **`transactions`** — The balance is currently always displayed. With this flag, it becomes optional; users can hide it if they prefer a more compact transactions list.
- **`balance_over_time`** — The chart shows historical balance trend but provides no at-a-glance current figure. When enabled, the current account balance is displayed in the tile header above the chart.

The flag is **not** available for `totals_by_category`, `income_vs_expense`, or `budget_progress` tiles — those tiles display spending or budget data rather than account balance.

### What "current balance" means

The current balance is the sum of all non-deleted transactions for the account: `SUM(amount_cents) WHERE deleted_at IS NULL`. This is the same value already shown in the Transactions tile (via `DashboardAccount.balance_cents`).

### Visual placement

When `show_balance` is `true`, the balance is rendered **inside the tile header** (the `Tile` wrapper), displayed alongside the account name — consistent with how `AccountTile` already renders `account.balance_cents`. Formatting uses the existing `formatCents()` and `balanceColor()` utilities.

For the **Balance over time** tile, the balance appears between the tile header and the time-window label, matching the layout of `AccountTile`.

### Settings UI

The Dashboard Settings table gains a **"Show balance"** checkbox column. The checkbox is rendered for each tile whose `tile_type` is `transactions` or `balance_over_time`; for other tile types the cell is left empty. Toggling the checkbox calls a new `PATCH /api/dashboard-config/:id` endpoint to persist the change immediately (no save button required, consistent with the reorder UX).

### Data fetching for Balance over time tile

`BalanceChartTile` does not currently receive a balance figure — it only fetches chart data points. To show balance without an extra round-trip, the `GET /api/dashboard-config` response (or alternatively the dashboard data endpoint) must include `balance_cents` per tile. The cleanest approach is to have `GET /api/dashboard-config` join `accounts` via the chart repository and return `balance_cents` alongside each item (only populated when `show_balance = true` and tile type is eligible).

Alternatively, `BalanceChartTile` can derive the current balance from the last point in the chart data array (`data[data.length - 1].balance_cents`). This avoids a new query but is only accurate when the time window extends to today. Given `balance_over_time` windows include the present, this is a viable shortcut.

We've decided to use the first method - include `balance_cents` in the `GET /api/dashboard-config` response.

### Backwards compatibility

The `show_balance` column is added to `dashboard_config` via a `try/catch ALTER TABLE` in `db.ts` (same pattern as `time_window`). Default value is `0` (false). A one-time backfill sets `show_balance = 1` for all existing rows where `tile_type = 'transactions'`.

## User stories

- As a user, I want to see my account balance at the top of my Balance over time tile so I can get an at-a-glance figure alongside the trend chart.
- As a user, I want to hide the balance from my Transactions tile so the tile shows more transactions in the same space.
- As a user, I want to configure the show-balance option per tile in Settings so my dashboard layout reflects my preferences.

## Key decisions

| Decision | Outcome |
|----------|---------|
| Which tile types support the flag | `transactions` and `balance_over_time` only. Other tile types show spending/budget data, not account balance. |
| Where the balance appears | Top of the tile, inside the header, using the existing `Tile` wrapper — same position as `AccountTile` today. |
| Flag applies to transactions tile | Yes. The flag controls whether balance is shown, allowing it to be hidden for a more compact view. |
| Toggle location | Dashboard Settings only (checkbox per eligible tile in the config table). |
| Backwards compatibility | Existing `transactions` tiles default to `show_balance = true` via a backfill. New tiles of all types default to `false`. |
| Balance source for BalanceChartTile | Add the `balance_cents` value to the ``GET /api/dashboard-config` response. |
| Persistence | `PATCH /api/dashboard-config/:id` with `{ show_balance: boolean }`. Change is saved immediately on checkbox toggle. |

## Acceptance criteria

```gherkin
Feature: Show current balance on dashboard tiles

  Background:
    Given the user has configured dashboard tiles

  Scenario: Existing transactions tiles default to show balance
    Given a transactions tile was created before this feature was deployed
    Then its show_balance flag is true
    And the account balance is displayed at the top of the tile

  Scenario: New tiles default to not show balance
    When the user adds a new tile of any type
    Then its show_balance flag is false

  Scenario: Enabling show balance on a Balance over time tile
    Given a "Balance over time" tile with show_balance = false
    When the user checks the "Show balance" checkbox for that tile in Settings
    Then the tile displays the account's current balance above the chart
    And the balance is styled with the correct color (green/red/neutral)

  Scenario: Disabling show balance on a Transactions tile
    Given a "Transactions" tile with show_balance = true
    When the user unchecks the "Show balance" checkbox for that tile in Settings
    Then the balance figure is no longer displayed at the top of the tile

  Scenario: Show balance checkbox not shown for ineligible tile types
    Given tiles of type "totals_by_category", "income_vs_expense", and "budget_progress"
    Then the "Show balance" column cell is empty for each of those tiles in Settings

  Scenario: Balance is formatted correctly
    Given a tile with show_balance = true
    When the account has a positive balance
    Then the balance is shown in green
    When the account has a negative balance
    Then the balance is shown in red
    When the account has a zero balance
    Then the balance is shown in the neutral text color
```

## Manual test steps

1. Open the app and navigate to **Settings → Dashboard**.
2. Confirm existing Transactions tiles have the "Show balance" checkbox **checked**.
3. Confirm that Totals by category, Income vs Expense, and Budget Progress tiles have **no** checkbox in the Show balance column.
4. Navigate to the **Dashboard** and confirm Transactions tiles display the account balance at the top of the tile as they did before.
5. In Settings, **uncheck** "Show balance" for a Transactions tile. Navigate to the Dashboard and confirm the balance is no longer visible on that tile.
6. Re-check "Show balance" in Settings and confirm the balance reappears on the Dashboard.
7. In Settings, add a new **Balance over time** tile. Confirm "Show balance" is unchecked by default.
8. Check "Show balance" for the Balance over time tile. Navigate to the Dashboard and confirm the account balance appears at the top of the tile, above the chart.
9. Confirm the balance colour matches the account's balance sign (green for positive, red for negative).
10. Restart the server and confirm all show_balance settings persist across restarts.

## Implementation tasks

1. **Database migration** — `server/src/db.ts`
   - Add `try/catch ALTER TABLE dashboard_config ADD COLUMN show_balance INTEGER NOT NULL DEFAULT 0` (same pattern as `time_window` at line 98).
   - After the ALTER, add a backfill: `UPDATE dashboard_config SET show_balance = 1 WHERE tile_type = 'transactions'`.

2. **Server repository** — `server/src/dashboard-config/repository.ts`
   - Add `show_balance: number` (0/1) to the `DashboardConfigItem` interface.
   - Update `getAll()` SELECT to include `show_balance`.
   - Update `add()` INSERT to accept and persist `show_balance` (default `0`).
   - Add `updateShowBalance(tileId: number, showBalance: boolean): boolean` function.

3. **Server routes** — `server/src/dashboard-config/routes.ts`
   - Update `GET /` response to include `show_balance` (comes through automatically once SELECT is updated).
   - Add `PATCH /:id` route that accepts `{ show_balance: boolean }` and calls `repo.updateShowBalance()`. Return 404 if tile not found, 400 if payload invalid.

4. **Client API** — `client/src/api/dashboardConfig.ts`
   - Add `show_balance: boolean` to `DashboardConfigItem`.
   - Add `updateShowBalance(tileId: number, showBalance: boolean): Promise<void>` function (PATCH call).

5. **Tile component — AccountTile** — `client/src/components/AccountTile.tsx`
   - Accept `showBalance: boolean` prop.
   - Wrap the existing balance `<div>` (lines 15–20) in `{showBalance && ...}`.
   - Update callers in `Dashboard.tsx`.

6. **Tile component — BalanceChartTile** — `client/src/components/BalanceChartTile.tsx`
   - Accept `showBalance: boolean` prop.
   - When `showBalance && data.length > 0`, render the balance derived from `data[data.length - 1].balance_cents` above the time-window label, using `formatCents()` and `balanceColor()` (import from `../utils/format`).
   - Update callers in `Dashboard.tsx`.

7. **Dashboard page** — `client/src/pages/Dashboard.tsx`
   - Pass `showBalance` from each `DashboardConfigItem` down to `AccountTile` and `BalanceChartTile`.

8. **Settings component** — `client/src/components/settings/DashboardSection.tsx`
   - Add a "Show balance" column header to the config table.
   - For each tile in the table, render a checkbox if `item.tile_type === 'transactions' || item.tile_type === 'balance_over_time'`; otherwise render nothing.
   - On checkbox change, call `updateShowBalance(item.id, checked)` and invalidate the `dashboard-config` and `dashboard` queries.
   - Add a `useMutation` for the PATCH call, consistent with the existing `reorderMutation` and `removeMutation` patterns.

9. **Tests**
   - Server: add tap tests for the `PATCH /:id` route (valid toggle, invalid payload, unknown id).
   - Client: add vitest tests for `AccountTile` rendering with `showBalance = true` and `showBalance = false`; same for `BalanceChartTile`.
