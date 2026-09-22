# Developer guide

## Dev container (recommended)

The dev container gives you a pre-configured Node 20 environment without installing anything locally beyond Docker and VS Code.

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [VS Code](https://code.visualstudio.com/) with the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

### Steps

1. Open the repo in VS Code.
2. When prompted "Reopen in Container", click it — or open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run **Dev Containers: Reopen in Container**.
3. Wait for the container to build and `npm install` to complete (first open only).
4. Run the dev server:
   ```
   npm run dev
   ```
5. VS Code will prompt to open the forwarded ports. The Vite dev server opens automatically in your browser at `http://localhost:5173`.

The SQLite database (`opensid.db`) is created in the container's workspace on first start and persists for the lifetime of the container volume.

---

## Local setup

See [README.md](README.md) for prerequisites and setup steps if you prefer a local Node installation.
