# Edit Tile Configuration

## Summary

From the Settings → Dashboard page, users can edit the configuration of any existing dashboard tile. An edit icon button in the tile's row opens a modal that allows changing the account, tile type, time window (where applicable), and whether the account balance is shown. Changes are saved immediately and reflected on the dashboard.

## Detailed description

The Settings → Dashboard table gains a dedicated edit icon button in the Actions column for each tile row, sitting alongside the existing move and remove buttons. Clicking it opens an "Edit tile" modal pre-populated with the tile's current values.

The modal contains:
- **Account** — dropdown of non-deleted accounts (same list as the add-tile form)
- **Tile type** — dropdown of all tile types
- **Time window** — dropdown shown only when the selected tile type requires one (`balance_over_time`, `totals_by_category`, `income_vs_expense`); hidden otherwise
- **Show balance** — checkbox shown only for tile types that support it (`transactions`, `balance_over_time`); replaces the inline checkbox currently in the table

When the user switches to a tile type that does not require a time window, the time window field is hidden and its value is silently discarded on save. When switching to a tile type that does require one, the time window field appears and must be filled before saving.

The tile's position in the dashboard is unaffected by editing.

The inline "Show balance" checkbox column is removed from the table now that it lives in the modal.

On save, the backend updates `account_id`, `tile_type`, `time_window`, and `show_balance` in one request. The dashboard re-fetches automatically via React Query cache invalidation.

Cancelling the modal (Cancel button, Escape key, or clicking the overlay) discards changes.

## User stories

- As a user, I want to edit an existing tile's account, type, or time window without removing and re-adding it, so that I can reconfigure my dashboard without losing its position.
- As a user, I want to control whether a tile shows the account balance from the edit modal, so that all tile configuration is in one place.

## Key decisions

| Decision | Outcome |
|---|---|
| Edit trigger location | Dedicated edit icon button in the Actions column, matching the budget edit pattern |
| Show balance field | Moved from inline table checkbox into the edit modal; inline checkbox column removed |
| Time window on tile-type change | Silently cleared when switching to a type that doesn't require a window |
| Account list | Only non-deleted accounts shown |
| Position on edit | Tile position is preserved unchanged |

## Validation

| Rule | Error message |
|---|---|
| Account is required | Account is required |
| Tile type is required | Tile type is required |
| Time window required when tile type demands it | Time window is required for this tile type |
| Time window value must be valid (`all`, `30d`, `3m`, `6m`, `12m`, or `Nw` where 1 ≤ N ≤ 52) | Invalid time window |

## Diagrams

```mermaid
sequenceDiagram
    actor User
    participant Table as DashboardSection table
    participant Modal as EditTileModal
    participant API as PATCH /api/dashboard-config/:id
    participant DB as SQLite

    User->>Table: Clicks edit icon on a tile row
    Table->>Modal: Opens with tile's current values
    User->>Modal: Changes account / tile type / time window / show balance
    User->>Modal: Clicks Save
    Modal->>API: PATCH { account_id, tile_type, time_window, show_balance }
    API->>DB: UPDATE dashboard_config SET ...
    DB-->>API: Updated row
    API-->>Modal: 200 OK — updated tile
    Modal-->>Table: Closes; React Query invalidates dashboard-config cache
    Table-->>User: Table re-renders with updated values
```

## Acceptance criteria

```gherkin
Feature: Edit tile configuration

  Background:
    Given I am on the Settings → Dashboard page
    And at least one tile exists

  Scenario: Edit icon is present on each tile row
    Then each tile row has an edit icon button in the Actions column

  Scenario: Modal opens pre-populated
    When I click the edit icon on a tile
    Then the "Edit tile" modal opens
    And the Account dropdown shows the tile's current account
    And the Tile type dropdown shows the tile's current tile type
    And if the tile type requires a time window, the Time window field shows the current value
    And if the tile type supports show balance, the Show balance checkbox reflects the current value

  Scenario: Editing account
    When I open the edit modal for a tile
    And I change the account to a different non-deleted account
    And I click Save
    Then the tile row shows the new account name
    And the dashboard tile reflects the new account

  Scenario: Editing tile type to one requiring a time window
    When I open the edit modal for a tile whose type has no time window
    And I change the tile type to "Balance over time"
    Then the Time window field appears
    When I select a time window and click Save
    Then the tile is updated successfully

  Scenario: Editing tile type to one not requiring a time window
    When I open the edit modal for a tile with a time window set
    And I change the tile type to "Transactions"
    Then the Time window field disappears
    When I click Save
    Then the tile is saved without a time window

  Scenario: Show balance moves to modal
    Then the table does not have an inline "Show balance" checkbox column
    When I open the edit modal for a "transactions" tile
    Then the Show balance checkbox is present in the modal
    When I toggle it and click Save
    Then the tile reflects the updated show balance setting

  Scenario: Show balance not shown for unsupported tile types
    When I open the edit modal for a "totals by category" tile
    Then the Show balance checkbox is not present

  Scenario: Validation — time window required
    When I open the edit modal for a tile
    And I change the tile type to "Balance over time"
    And I do not select a time window
    And I click Save
    Then an error message "Time window is required for this tile type" is shown
    And the modal remains open

  Scenario: Cancelling discards changes
    When I open the edit modal for a tile
    And I change the account
    And I click Cancel
    Then the modal closes
    And the tile row is unchanged

  Scenario: Escape key closes modal
    When the edit modal is open
    And I press Escape
    Then the modal closes without saving

  Scenario: Clicking the overlay closes modal
    When the edit modal is open
    And I click outside the modal
    Then the modal closes without saving

  Scenario: Account dropdown only shows non-deleted accounts
    Given an account has been deleted
    When I open the edit modal
    Then the deleted account does not appear in the Account dropdown
```

## Manual test steps

1. Open the app and navigate to **Settings → Dashboard**.
2. Confirm no inline "Show balance" checkbox column exists in the tile table.
3. Confirm each tile row has an edit (pencil) icon button in the Actions column.
4. Click the edit icon on a tile. Confirm the modal opens and fields are pre-populated with the tile's current values.
5. Change the Account to a different account. Click **Save**. Confirm the tile row shows the new account and the dashboard updates.
6. Reopen the modal. Change the Tile type to one that requires a time window (e.g. "Balance over time"). Confirm the Time window field appears. Select a time window. Click **Save**. Confirm the tile updates.
7. Reopen the modal. Change the Tile type to one that does not require a time window (e.g. "Transactions"). Confirm the Time window field disappears. Click **Save**. Confirm the tile saves without error.
8. For a "transactions" or "balance over time" tile, open the modal. Confirm the **Show balance** checkbox is present. Toggle it. Click **Save**. Confirm the dashboard tile reflects the change.
9. For a "totals by category" tile, open the modal. Confirm no **Show balance** checkbox is shown.
10. Set tile type to "Balance over time", clear the time window selection, and click **Save**. Confirm an error message appears and the modal stays open.
11. Make a change in the modal and click **Cancel**. Confirm the tile is unchanged.
12. Open the modal and press **Escape**. Confirm it closes without saving.
13. Open the modal and click the dark overlay outside the modal. Confirm it closes without saving.
14. If a deleted account exists, confirm it does not appear in the Account dropdown.

## Implementation tasks

1. **Extend the backend PATCH endpoint** — `server/src/dashboard-config/routes.ts`
   - Currently only handles `show_balance`. Extend to accept `account_id`, `tile_type`, and `time_window` in the request body.
   - Reuse the existing validation logic from the POST handler for tile type and time window.
   - Return the full updated `DashboardConfigItem`.
   - Add/extend the repository function `update(id, fields)` in `server/src/dashboard-config/repository.ts`.

2. **Add backend tests** — `server/src/dashboard-config/routes.test.ts`
   - PATCH updates account, tile type, time window, show balance.
   - PATCH clears time window when switching to a non-windowed type.
   - PATCH returns 422 when time window missing for a type that requires it.
   - PATCH returns 404 for unknown tile id.

3. **Add `updateTile` API client function** — `client/src/api/dashboardConfig.ts`
   - `updateTile(id: number, payload: Partial<UpdateTilePayload>): Promise<DashboardConfigItem>`
   - Calls `PATCH /api/dashboard-config/:id`.
   - Define `UpdateTilePayload` type: `{ account_id, tile_type, time_window, show_balance }`.

4. **Build `EditTileModal` component** — `client/src/components/settings/EditTileModal.tsx`
   - Props: `tile: DashboardConfigItem`, `accounts: Account[]`, `onSave: () => void`, `onCancel: () => void`.
   - Form state: account_id, tile_type, time_window, show_balance.
   - Use the same tile type options, time window options, and `needsWindow` / `isIncomeVsExpense` logic as the add-tile form in `DashboardSection.tsx`.
   - Show balance checkbox only when tile type is `transactions` or `balance_over_time`.
   - Validate time window presence before calling the mutation.
   - Use `useMutation` (React Query) wrapping `updateTile`; invalidate `dashboard-config` query on success.
   - Follow modal CSS/UX patterns from `AccountForm.tsx` or the inline pattern from `BudgetsSection.tsx` (overlay dismiss, Escape key).

5. **Update `DashboardSection.tsx`** — `client/src/components/settings/DashboardSection.tsx`
   - Add `editingTile: DashboardConfigItem | null` state.
   - Add edit icon button to each tile's Actions cell (use `EditIcon` or equivalent, matching the budget edit pattern).
   - Remove the inline "Show balance" checkbox column from the table.
   - Render `<EditTileModal>` when `editingTile` is set.
