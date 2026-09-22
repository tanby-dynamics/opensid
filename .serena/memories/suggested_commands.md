# Suggested Commands

All commands run from the repo root `/home/bec/development/tanby-dynamics/opensid` unless noted.

## Development

```sh
npm run dev          # start both client (5173) and server (3000) concurrently
npm run dev -w client  # client only
npm run dev -w server  # server only (tsx watch)
```

## Build

```sh
npm run build        # build client (tsc + vite) and server (tsc)
npm run build -w client
npm run build -w server
```

## Test

```sh
npm run test         # run all tests (vitest run + tap)
npm run test -w client   # vitest run
npm run test -w server   # cross-env DATABASE_PATH=:memory: tap
npm run test:watch -w client  # vitest watch mode
```

## Lint & Format

```sh
npm run lint         # eslint client + server
npm run format       # prettier --write on all src ts/tsx files
npm run lint -w client
npm run lint -w server
```
