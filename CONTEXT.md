# OpenSid

A personal/household finance app: accounts, transactions, budgets, and a configurable dashboard. Single-tenant — there is no per-user concept; saved things are scoped to an account or to the whole app.

## Language

**Dashboard Tile**:
One configured widget on the dashboard, backed by a single `dashboard_config` row (`tile_type`, `account_id`, `position`, plus type-specific settings like `time_window`). Most tile types belong to one account; `net_worth` and `net_worth_chart` are cross-account.
_Avoid_: Widget, panel

**Saved View**:
A named, reusable set of transaction filter criteria (keyword, date range, category, type, amount range, tags, cleared, attachment, recurring), scoped to a single account or globally. Created from the transaction filter bar via "Save as view."
_Avoid_: Filter view, saved filter, saved search

**Cleared**:
A per-transaction boolean state (`cleared_at` timestamp, NULL = uncleared) meaning the transaction has been matched against a bank statement. Toggled per-row via a quick-clear tick, or in bulk during a Reconciliation. Underlies the Cleared Balance shown on Account Detail.
_Avoid_: Reconciled (see Reconciliation — a stricter, separate concept)

**Reconciliation**:
A per-account session that certifies a statement: the user enters a statement date and statement balance, the app compares it to the account's Cleared Balance, and on a zero difference the session is recorded (`reconciliations` table: `account_id`, `statement_date`, `statement_balance_cents`, `completed_at`). Distinct from Cleared — an account can have cleared transactions with no completed Reconciliation.
_Avoid_: Cleared, clearing

**Reconciliation Enabled**:
A per-account flag (`accounts.reconciliation_enabled`) gating both Cleared and Reconciliation for that account: when off, the quick-clear toggle, Cleared Balance chip, and the whole Reconciliation workflow (Reconcile button, setup dialog, history) are hidden, and the clear/unclear/reconciliation API routes reject changes. Existing `cleared_at` data and reconciliation history are preserved, not deleted, and reappear if re-enabled. Saved View filtering on `cleared` is unaffected either way. New accounts default to off; accounts that existed before this flag was introduced were grandfathered to on.
_Avoid_: Reconciliation mode, tracking reconciliation
