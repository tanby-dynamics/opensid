# OpenSid — Agent guidelines

## Application overview

OpenSid is a self-hosted, single-user expense tracker. It is a TypeScript monorepo with two workspaces:

- `/client` — Vite + React + TypeScript + TailwindCSS, served on port 5173. Proxies `/api` requests to the server.
- `/server` — Node + Express + TypeScript + better-sqlite3, served on port 3000.

The database is SQLite (`opensid.db`). All deletes are soft-deletes: accounts, transactions, and attachments each have a `deleted_at` timestamp. Deleting an account cascades soft-deletes to its transactions and their attachments.

### Data model (abbreviated)

- `accounts` — named buckets for tracking money (`id`, `name`, `created_at`, `deleted_at`)
- `transactions` — belong to one account; amount stored as signed integer cents, income positive, expense negative (`id`, `account_id`, `description`, `amount_cents`, `type`, `date`, `notes`, `created_at`, `updated_at`, `deleted_at`)
- `attachments` — file blobs attached to transactions, stored directly in SQLite (`id`, `transaction_id`, `filename`, `mime_type`, `data`, `created_at`, `deleted_at`)

### Key domain rules

- Amount is always stored in cents as a signed integer. The UI accepts positive values and applies the sign based on `type` (`income` | `expense`).
- Account balance = sum of all non-deleted transaction `amount_cents` for that account (no date window).
- The REST API is the only interface between client and server.

---

## Code style

### Indentation

Use **4 spaces per indent level**. Never use tab characters.

### Semicolons

Always terminate statements with a semicolon.

```ts
// correct
const x = 1;
return x;

// wrong
const x = 1
return x
```

### Function declarations

Prefer explicit `function` declarations over arrow functions at the top level and at the component level. Reserve arrow functions for callbacks, inline handlers, and short expressions passed as arguments.

```tsx
// correct — top-level and component-level
function formatCents(cents: number): string { ... }
export default function Dashboard() { ... }

// correct — inline / callback context
const sorted = items.sort((a, b) => a.date.localeCompare(b.date));
<button onClick={() => handleDelete(id)}>Delete</button>

// wrong — top-level or component-level
const formatCents = (cents: number): string => { ... };
const Dashboard = () => { ... };
```

---

## Frontend stack decisions

### HTTP client

Use **axios** for all API calls from the client. Do not use `fetch` directly.

### Data fetching and state

Use **React Query** where data is fetched from the API and needs caching, refetching, or loading/error states. Use plain `useState`/`useEffect` for purely local UI state. Do not reach for React Query if a simple state variable will do the job.

### Routing

Use **React Router** for all client-side navigation.

### Error handling

Surface API and runtime errors to the user via **toasts**. Do not use inline error messages or alert dialogs for errors.

---

## Testing and building

Whenever a change is made to the frontend or backend, the project should be built and tests run. If there are any errors, fix them and iterate.

```sh
# Frontend
cd frontend
npm run build
npm run test

cd ..

# Backend
cd backend
npm run build
npm run test

### Policy

- All new features must include tests.
- All changes that touch existing behaviour must update or extend existing tests.
- Failing builds and tests must be fixed before a feature is considered complete.
- ESLint and Prettier must pass before a feature is considered complete.

---

## Linting and formatting

The project uses **ESLint** and **Prettier**. Run both before committing:

```bash
npm run lint
npm run format
```

