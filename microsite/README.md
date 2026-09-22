# OpenSid Microsite

Static marketing page for OpenSid, packaged as a standalone container image.

## Contents

- `index.html`
- `logo.svg`
- `favicon.svg`
- `screenshots/dashboard.png`
- `screenshots/new-transaction.png`
- `Dockerfile`

## Run locally with Docker

From the repository root:

```bash
docker build -f microsite/Dockerfile microsite -t opensid-microsite:local
docker run --rm -p 8080:80 opensid-microsite:local
```

Then open:

- http://localhost:8080

## Run locally without Docker

You can also serve the static files directly:

```bash
cd microsite
python3 -m http.server 8080
```

Then open:

- http://localhost:8080

## Published image

The GitHub workflow builds and pushes this microsite image on version tags:

- `ghcr.io/tanby-dynamics/opensid-microsite:<version>`
- `ghcr.io/tanby-dynamics/opensid-microsite:latest`

Workflow file:

- `.github/workflows/publish.yml`
