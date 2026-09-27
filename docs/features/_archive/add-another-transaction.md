# Add Another Transaction

## Summary

Add an "Add another transaction" checkbox to the Add Transaction modal. When checked and a transaction is saved successfully, the modal stays open, all fields are cleared except the account selector, and the user can immediately enter another transaction without reopening the modal.

## Detailed description

A checkbox labelled "Add another transaction" appears in the footer of the Add Transaction modal, to the left of the Save button. It is only shown when adding a new transaction — not when editing an existing one.

The checkbox state is persisted to `localStorage` so it is remembered across sessions, matching the behaviour of the account selector preference. On first use it defaults to unchecked.

**When the checkbox is unchecked (default behaviour):**
- Saving a transaction closes the modal and shows `toast.success('Transaction added.')` — no change from the current behaviour.

**When the checkbox is checked:**
- Saving a transaction shows `toast.success('Transaction added.')`.
- The modal remains open.
- All form fields are reset to their defaults, except the account selector which retains its current value.
- Focus moves to the first field (Type or Category, depending on context) so the user can begin entering the next transaction immediately.

The checkbox appears in both locations where the Add Transaction modal is used:
- **Account Detail page** — no account selector is present (the account is implicit), so "except the account selector" has no effect here.
- **Dashboard global add modal** — the account selector is preserved when "Add another" is checked.

## User stories

- As a user entering multiple transactions in a session, I want to add another transaction without reopening the modal, so that I can work through a batch of entries quickly.
- As a user who only occasionally adds multiple transactions, I want the "Add another" option to be opt-in and remembered, so that it doesn't change my workflow unless I choose it.

## Key decisions

| Decision | Outcome |
|---|---|
| Default state of checkbox | Unchecked on first use; persisted to `localStorage` thereafter |
| Which fields reset on save | All fields reset to defaults except the account selector |
| Visual feedback when modal stays open | Existing `toast.success('Transaction added.')` fires; no additional in-modal indicator |
| Which modals include the checkbox | Both the Account Detail add modal and the Dashboard global add modal |
| Edit flow | Checkbox is not shown when editing an existing transaction |

## Acceptance criteria

```gherkin
Feature: Add another transaction checkbox

  Scenario: Checkbox is hidden when editing a transaction
    Given I open the Edit Transaction modal
    Then I do not see an "Add another transaction" checkbox

  Scenario: Checkbox defaults to unchecked on first use
    Given I have never interacted with the "Add another transaction" checkbox
    When I open the Add Transaction modal
    Then the "Add another transaction" checkbox is unchecked

  Scenario: Checkbox state is remembered across sessions
    Given I have previously checked the "Add another transaction" checkbox
    When I open the Add Transaction modal in a new session
    Then the "Add another transaction" checkbox is checked

  Scenario: Unchecked — modal closes after save (existing behaviour)
    Given the "Add another transaction" checkbox is unchecked
    When I fill in a valid transaction and click Save
    Then the transaction is saved
    And a success toast "Transaction added." appears
    And the modal closes

  Scenario: Checked — modal stays open after save
    Given the "Add another transaction" checkbox is checked
    When I fill in a valid transaction and click Save
    Then the transaction is saved
    And a success toast "Transaction added." appears
    And the modal remains open

  Scenario: Checked — form fields reset after save, account preserved (Dashboard)
    Given I am on the Dashboard
    And the "Add another transaction" checkbox is checked
    And I have selected an account
    When I fill in a valid transaction and click Save
    Then the Category, Description, Amount, Date, Notes, and Recurrence fields are reset to their defaults
    And the account selector retains its previously selected value

  Scenario: Checked — all fields reset after save (Account Detail)
    Given I am on the Account Detail page
    And the "Add another transaction" checkbox is checked
    When I fill in a valid transaction and click Save
    Then all form fields are reset to their defaults

  Scenario: Checked — focus returns to first field after save
    Given the "Add another transaction" checkbox is checked
    When I fill in a valid transaction and click Save
    Then focus moves to the first editable field in the form

  Scenario: Validation errors do not trigger reset or stay-open logic
    Given the "Add another transaction" checkbox is checked
    When I submit the form with invalid or missing required fields
    Then the form shows validation errors
    And no transaction is saved
    And the modal remains open with the entered values intact

  Scenario: Save failure does not trigger reset or stay-open logic
    Given the "Add another transaction" checkbox is checked
    And the API returns an error
    When I submit a valid transaction
    Then an error toast appears
    And the modal remains open with the entered values intact
```

## Manual test steps

1. Open the app and navigate to any account's detail page.
2. Click "Add transaction" to open the modal.
3. Confirm the "Add another transaction" checkbox is not visible when editing — open an existing transaction to verify.
4. Close the edit modal and open the Add Transaction modal again.
5. Confirm the checkbox is present and unchecked.
6. Fill in all required fields and save. Confirm the modal closes and a success toast appears (existing behaviour unchanged).
7. Open the Add Transaction modal again and check the "Add another transaction" checkbox.
8. Fill in all required fields and save. Confirm:
   - A success toast appears.
   - The modal stays open.
   - All fields are cleared (Category, Description, Amount, Date, Notes, Recurrence).
9. Close the modal and reopen it. Confirm the checkbox is still checked (persisted).
10. Navigate to the Dashboard and open the global Add Transaction modal (the one with an account selector).
11. Select an account, check "Add another transaction", fill in the form, and save. Confirm:
    - The modal stays open.
    - All fields are cleared except the account selector, which still shows the previously selected account.
12. Uncheck "Add another transaction" and save a transaction. Confirm the modal closes normally.

## Implementation tasks

1. **Persist `addAnother` preference to `localStorage`** — Add a small utility (or inline logic) to read/write a `addAnotherTransaction` key in `localStorage`. Default to `false` when absent.

2. **Add checkbox state and UI to `TransactionForm`** — In [client/src/components/TransactionForm.tsx](client/src/components/TransactionForm.tsx), add a controlled checkbox in the form footer. Only render it when the form is in create mode (guard on an existing `isEditing` or equivalent prop). Initialise state from `localStorage` and write back on change.

3. **Expose `addAnother` to the parent via the submit callback** — Change the `onSubmit` signature from `onSubmit(data: TransactionData)` to `onSubmit(data: TransactionData, addAnother: boolean)` so the parent can decide whether to close the modal.

4. **Add a `resetForm` capability to `TransactionForm`** — Expose an imperative reset (via `useImperativeHandle` / `forwardRef`, or a `key` prop reset pattern) that clears all fields except `accountId`. The parent calls this after a successful save when `addAnother` is true.

5. **Update `AccountDetail.tsx` create handler** — In [client/src/pages/AccountDetail.tsx](client/src/pages/AccountDetail.tsx), update `handleCreate` to accept the `addAnother` flag. When `true`, skip `setModal(null)` and call the form reset instead. When `false`, retain existing close behaviour.

6. **Update `Dashboard.tsx` create handlers** — In [client/src/pages/Dashboard.tsx](client/src/pages/Dashboard.tsx), apply the same change to both the account-specific and global add handlers. The form reset must preserve the selected `accountId`.

7. **Move focus after reset** — After the form resets, move focus to the first interactive field. This can be done with a `useEffect` that watches a "just reset" flag, or by calling `.focus()` directly in the reset function.
