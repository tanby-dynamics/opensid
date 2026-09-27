# Distribute via Docker

## Summary

Package OpenSid as a single Docker image that serves both the React frontend (as compiled static files) and the Express API from one Node process on one port. A GitHub Actions workflow publishes multi-platform images to GHCR on every Git tag push. A `docker/` directory provides a ready-to-use `docker-compose.yml` and `.env.example` for self-hosters.

---

## Detailed description

### Container architecture

The production image runs a single Node process (the Express server). During the Docker build, Vite compiles the React app to static files which are embedded in the image and served by Express at runtime. There is no Vite dev server, no Nginx, and no process manager in the container.

```
Browser → :3000 → Express
                    ├── /api/*       → API route handlers
                    └── /*           → serves client/dist (SPA catch-all → index.html)
```

Express detects the presence of `client/dist` at startup and enables static file serving automatically. In development (no dist directory), this block is skipped and Vite's dev proxy handles the frontend as today.

### Dockerfile (multi-stage)

| Stage | Base | Purpose |
|---|---|---|
| `build-client` | `node:20-alpine` | Install client deps, run `vite build`, produce `client/dist` |
| `build-server` | `node:20-alpine` | Install all server deps (including native `better-sqlite3`), compile TypeScript to `server/dist` |
| `runtime` | `node:20-alpine` | Copy compiled server + client dist + production deps only; expose 3000; run `node server/dist/index.js` |

**Native module note:** `better-sqlite3` compiles a native C++ addon at `npm install` time. The build stage must run on each target architecture; cross-compilation is not possible. The GH Actions workflow uses QEMU emulation to build the ARM64 variant on an amd64 runner. Expect ARM64 build times of 10–20 minutes due to emulation overhead.

### Static file serving (server change)

`server/src/index.ts` gains a block placed **after all `/api` routes**:

```ts
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}
```

The `existsSync` guard means no change in behaviour during `npm run dev`.

### CORS configuration

The `cors()` middleware in `server/src/index.ts` reads `CORS_ORIGIN` from the environment. If set, it restricts the `Access-Control-Allow-Origin` header to that value. If unset, the middleware allows all origins (preserving current dev behaviour).

```ts
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
```

### docker-compose.yml (`docker/docker-compose.yml`)

```yaml
services:
  opensid:
    image: ghcr.io/tanby-dynamics/opensid:latest
    ports:
      - "3000:3000"
    volumes:
      - ./data:/data
    env_file:
      - .env
    restart: unless-stopped
```

The `./data` host directory persists the SQLite database across container restarts. Self-hosters create it once and it is never managed by Docker.

### Environment variables (`docker/.env.example`)

```
# Path inside the container where opensid.db is stored.
# Must match the volume mount in docker-compose.yml.
DATABASE_PATH=/data/opensid.db

# Restrict CORS to a specific origin, e.g. https://opensid.example.com
# Leave unset or use * to allow all origins.
CORS_ORIGIN=*
```

The `docker/.env` file (user-created from the example) is gitignored.

### GitHub Actions workflow (`.github/workflows/publish.yml`)

- **Trigger:** `on: push: tags: ['v*.*.*']`
- **Platforms:** `linux/amd64`, `linux/arm64`
- **Registry:** `ghcr.io`, authenticated via `GITHUB_TOKEN`
- **Image tags:**
  - `ghcr.io/tanby-dynamics/opensid:latest`
  - `ghcr.io/tanby-dynamics/opensid:<git-tag>` (e.g. `v1.2.0`)
- **Steps:** checkout → QEMU setup → Buildx setup → GHCR login → extract metadata → build and push

### README additions

A "Releasing a new version" section documents the tag-and-push flow. A "Self-hosting with Docker" section covers the docker-compose setup.

---

## Key decisions

| Decision | Outcome |
|---|---|
| Single port, Express serves static files | Avoids process manager complexity; standard pattern for self-hosted Node apps; Vite dev server is not suitable for production |
| Existence check, not `NODE_ENV`, to enable static serving | Works correctly without requiring `NODE_ENV=production` to be set; no behaviour change in dev |
| `better-sqlite3` native module → QEMU for ARM64 | QEMU is free and sufficient; ARM64 builds will be slow (~15 min) but unblocking |
| Multi-platform: amd64 + arm64 | Self-hosters commonly use Raspberry Pi and ARM NAS devices |
| Publish on Git tag push (`v*.*.*`) | Images track intentional releases, not every commit to main |
| `latest` + version tag | `latest` for convenience; version tag for pinning and rollback |
| `CORS_ORIGIN` defaults to `*` | Preserves current open CORS behaviour; self-hosters who need restriction set the var explicitly |
| `docker/` subdirectory for compose files | Keeps repo root clean; self-hosters clone or download just that directory |

---

## User stories

**As a maintainer,** I want to push a Git tag and have a versioned Docker image automatically published to GHCR, so that I can release OpenSid without manual build steps.

**As a self-hoster,** I want to run OpenSid with `docker compose up` using a provided `docker-compose.yml`, so that I can host the app without a local Node.js environment or build toolchain.

---

## Manual test steps

### Local image build and smoke test

1. From the repo root, run `docker build -t opensid:local .`
2. Create `docker/data/` directory and a minimal `.env` file copied from `docker/.env.example`
3. Run `docker compose -f docker/docker-compose.yml up`
4. Open `http://localhost:3000` — the React app should load
5. Create an account, add a transaction — verify normal app behaviour
6. Stop the container (`Ctrl+C`), restart it (`docker compose up`), verify data persisted

### SPA routing

7. Navigate directly to a deep URL (e.g. `http://localhost:3000/accounts/1`) — should not 404; React router should handle it

### Environment variables

8. Set `CORS_ORIGIN=http://localhost:3000` in `.env`, restart — verify the response header `Access-Control-Allow-Origin: http://localhost:3000` is present on API responses
9. Set `DATABASE_PATH=/data/custom.db`, restart — verify the database file is created at that path inside the container

### Multi-platform (if Docker Buildx available locally)

10. Run `docker buildx build --platform linux/arm64 -t opensid:arm64-test --load .` — image should build without error

### GH Actions publish

11. Push a tag: `git tag v0.0.1-test && git push origin v0.0.1-test`
12. Check the Actions tab — workflow should trigger, complete successfully, and publish `ghcr.io/tanby-dynamics/opensid:v0.0.1-test` and `ghcr.io/tanby-dynamics/opensid:latest` to GHCR
13. Pull and run the published image: `docker pull ghcr.io/tanby-dynamics/opensid:v0.0.1-test`

---

## Implementation tasks

### 1. Add TypeScript build script to server

**File:** `server/package.json`, `server/tsconfig.json`

Add a `build` script (`tsc`) to `server/package.json`. Ensure `server/tsconfig.json` has `"outDir": "dist"` and `"rootDir": "src"`. The compiled output will be at `server/dist/index.js`.

No dependencies.

---

### 2. Add CORS_ORIGIN environment variable support

**File:** `server/src/index.ts`

Update the existing `app.use(cors())` call (added in OPENSID-001) to read `CORS_ORIGIN`:

```ts
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
```

Depends on: OPENSID-001 server scaffold.

---

### 3. Add static file serving to Express

**File:** `server/src/index.ts`

Add `import fs from 'fs'` and `import path from 'path'`. After all `/api` route registrations, add the static file serving block (see Detailed description). The catch-all must be last to avoid intercepting API routes.

Depends on: task 1 (so `__dirname` is known to resolve correctly in compiled JS), OPENSID-001.

---

### 4. Create multi-stage Dockerfile

**File:** `Dockerfile` (repo root)

Three stages: `build-client`, `build-server`, `runtime`. The runtime stage copies `server/dist`, `client/dist`, and server production `node_modules` only. Sets `WORKDIR /app`, `EXPOSE 3000`, `CMD ["node", "server/dist/index.js"]`.

Key detail: `npm ci` in the `build-server` stage compiles `better-sqlite3` native bindings for the target platform. Do not use `--omit=dev` in the build stage (devDeps needed for `tsc`); use `--omit=dev` in the runtime stage.

Depends on: tasks 1, 3.

---

### 5. Create `docker/` directory with compose files

**Files:** `docker/docker-compose.yml`, `docker/.env.example`

See content in Detailed description above. Add `docker/.env` to the root `.gitignore` (the existing `.gitignore` from OPENSID-001 covers `.env` at root; confirm it also covers `docker/.env`, or add an explicit entry).

Depends on: task 4.

---

### 6. Create GitHub Actions publish workflow

**File:** `.github/workflows/publish.yml`

Trigger on `v*.*.*` tag push. Steps: `actions/checkout`, `docker/setup-qemu-action`, `docker/setup-buildx-action`, `docker/login-action` (registry: `ghcr.io`, username: `${{ github.actor }}`, password: `${{ secrets.GITHUB_TOKEN }}`), `docker/metadata-action` (tags: `type=semver,pattern={{version}}` and `type=raw,value=latest`), `docker/build-push-action` (platforms: `linux/amd64,linux/arm64`, push: true).

Depends on: task 4. No repository secrets need to be created — `GITHUB_TOKEN` is provided automatically by Actions.

---

### 7. Update README.md

**File:** `README.md`

Add two sections:

**Self-hosting with Docker** — prerequisites (Docker + Compose), steps: clone repo or download `docker/`, copy `.env.example` to `.env` and edit, create `docker/data/` directory, run `docker compose up -d`, open `http://localhost:3000`.

**Releasing a new version** — steps: ensure main is clean, run `git tag v<major>.<minor>.<patch>`, run `git push origin v<major>.<minor>.<patch>`, confirm the Actions workflow completes in the GitHub UI.

Depends on: tasks 5, 6.
