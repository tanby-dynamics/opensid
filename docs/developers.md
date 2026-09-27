# Developer onboarding

## Prerequisites

- **Node.js 20** (LTS). Node 24 is not supported — `better-sqlite3` has no pre-built binaries for it yet and requires a C++ build toolchain to compile from source. Use nvm to switch: `nvm install 20 && nvm use 20`.
- npm 10+
- Docker + Docker Compose (for running the containerised app locally)

## Repository structure

```
/
├── client/          # Vite + React + TypeScript + TailwindCSS (port 5173 in dev)
├── server/          # Express + TypeScript + better-sqlite3 (port 3000 in dev)
├── docker/          # docker-compose.yml and .env.example for self-hosting
├── wiki/            # Project documentation and feature specs
├── AGENTS.md        # Coding guidelines for AI agents
└── package.json     # Root workspace — run dev and scripts from here
```

## Getting started

```bash
npm install
npm run dev
```

This starts both the Vite dev server (`http://localhost:5173`) and the Express API (`http://localhost:3000`) concurrently. The Vite server proxies `/api` requests to Express.

The SQLite database (`opensid.db`) is created automatically on first server start. Its path can be overridden with the `DATABASE_PATH` environment variable.

## Tech stack

### Client (`/client`)

| Concern | Library |
|---|---|
| Framework | React 18 |
| Build tool | Vite |
| Language | TypeScript |
| Styling | TailwindCSS |
| Routing | React Router |
| HTTP client | axios |
| Data fetching / caching | React Query (where caching/refetch matters); `useState`/`useEffect` for simple local state |
| Error feedback | Toasts |
| Tests | Vitest |

### Server (`/server`)

| Concern | Library |
|---|---|
| Framework | Express |
| Language | TypeScript (compiled via `tsc` for production, `tsx watch` for dev) |
| Database | SQLite via `better-sqlite3` |
| Tests | tap |

## Running tests

### Frontend tests

```bash
npm run test --workspace=client
```

### Backend tests

```bash
npm run test --workspace=server
```

### Policy

- New features require tests.
- Changes to existing behaviour require updated or extended tests.
- Failing tests must be fixed before marking a feature complete.

## Linting and formatting

The project uses ESLint and Prettier.

```bash
npm run lint      # check for lint errors
npm run format    # apply Prettier formatting
```

Both must pass before committing.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_PATH` | `opensid.db` (repo root) | Path to the SQLite database file |
| `CORS_ORIGIN` | `*` | Allowed CORS origin; restrict in production (e.g. `https://opensid.example.com`) |

In development, create a `.env` file in the repo root if you need to override these. The `.env` file is gitignored.

## Releasing a new version

Releases are published as Docker images to GHCR automatically when a Git tag is pushed.

```bash
git tag v<major>.<minor>.<patch>
git push origin v<major>.<minor>.<patch>
```

The GitHub Actions workflow builds multi-platform images (`linux/amd64`, `linux/arm64`) and publishes two tags: `latest` and the version tag (e.g. `v1.2.0`). Monitor progress in the Actions tab on GitHub.

## Self-hosting with Docker

```bash
cd docker/
cp .env.example .env
# edit .env as needed
mkdir data
docker compose up -d
```

The app will be available at `http://localhost:3000`. The SQLite database is persisted in `docker/data/`.

## Key domain rules

- All amounts are stored as signed integers in cents (`amount_cents`). The UI always accepts a positive number; the sign is derived from `type` (`income` → positive, `expense` → negative).
- All deletes are soft-deletes (`deleted_at` timestamp). Deleting an account cascades to its transactions and their attachments in a single DB transaction.
- Account balance = `SUM(amount_cents)` of all non-deleted transactions for that account (no date window).
- Attachments are stored as blobs directly in SQLite — there is no filesystem storage.
