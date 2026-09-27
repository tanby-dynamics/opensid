# OpenSid

A personal/household finance app: accounts, transactions, budgets, and a configurable dashboard. Single-tenant — there is no per-user concept; saved things are scoped to an account or to the whole app.

## Language

**Dashboard Tile**:
One configured widget on the dashboard, backed by a single `dashboard_config` row (`tile_type`, `account_id`, `position`, plus type-specific settings like `time_window`). Most tile types belong to one account; `net_worth` and `net_worth_chart` are cross-account.
_Avoid_: Widget, panel

**Saved View**:
A named, reusable set of transaction filter criteria (keyword, date range, category, type, amount range, tags, cleared, attachment, recurring), scoped to a single account or globally. Created from the transaction filter bar via "Save as view."
_Avoid_: Filter view, saved filter, saved search
