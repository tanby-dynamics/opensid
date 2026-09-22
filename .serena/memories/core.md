# Core — opensid

Self-hosted single-user expense tracker. TypeScript npm workspaces monorepo at `/home/bec/development/tanby-dynamics/opensid`.

## Workspace layout

- `/client` — Vite + React frontend, port 5173; proxies `/api` to server
- `/server` — Express + better-sqlite3 backend, port 3000
- Root `package.json` — workspace orchestration scripts only

## Source maps

- `server/src/index.ts` — server entry point
- `server/src/db.ts` — SQLite database setup
- `server/src/<domain>/` — one folder per domain (accounts, transactions, attachments, budgets, categories, tags, transfers, recurrence, reports, dashboard, dashboard-config, saved-views, chart, export, import, backup)
- `client/src/main.tsx` — client entry point
- `client/src/App.tsx` — root component + routing
- `client/src/pages/` — top-level route components
- `client/src/components/` — shared UI components
- `client/src/api/` — axios API call modules (one file per domain)
- `client/src/types/` — shared TypeScript types
- `client/src/utils/` — utility functions

## Data model invariants

- All deletes are **soft-deletes** — `deleted_at` timestamp; never hard-delete rows
- Amounts stored as **signed integer cents** (`amount_cents`): income positive, expense negative
- Account balance = sum of all non-deleted `amount_cents` for the account (no date window)
- Cascade: deleting an account soft-deletes its transactions and their attachments

## Domain modules

`accounts`, `transactions`, `attachments`, `budgets`, `categories`, `tags`, `transfers`, `recurrence`, `reports`, `dashboard`, `dashboard-config`, `saved-views`, `chart`, `export`, `import`, `backup`

See `mem:tech_stack`, `mem:conventions`, `mem:suggested_commands`, `mem:task_completion`.
