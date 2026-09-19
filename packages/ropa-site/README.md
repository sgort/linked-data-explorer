# ropa-site

Public-facing static site for the RONL Register van verwerkingsactiviteiten (RoPA).

Deployed as an Azure Static Web Apps resource, isolated from the LDE stack, at
`ropa.open-regels.nl` (production) and `acc.ropa.open-regels.nl` (acceptance).

## What it does

Fetches active RoPA records from the LDE backend's public endpoint and renders them
as a collapsible card list. No authentication required — the endpoint only returns
records with `status = 'active'`.

## Configuration

There is no build step, so `index.html` picks its backend from the hostname it is
served on:

| Served on                   | Backend                                         |
| --------------------------- | ----------------------------------------------- |
| `localhost` or `127.0.0.1`  | `http://localhost:3001`                         |
| a host starting with `acc.` | `https://acc.backend.linkeddata.open-regels.nl` |
| anything else               | `https://backend.linkeddata.open-regels.nl`     |

The request is `GET /v1/ropa/public?organisation=flevoland`. Change the
`organisation` query parameter in `index.html` to scope the list to a different
controller.

## Deployment

No build step: the contents of this directory are deployed as they are, by two
workflows.

- `.github/workflows/azure-ropa-site-acc.yml` deploys acceptance on a push to `acc`
  that touches `packages/ropa-site`, and builds a preview for a pull request
  against `acc`.
- `.github/workflows/azure-ropa-site-prod.yml` deploys production on a push to
  `main` that touches `packages/ropa-site`.

## Local development

**Serve the directory on localhost; do not open `index.html` as a file.** Opened
from disk, the page has no hostname, so it falls through to the last row above and
talks to the **production** backend, not your local one.

```bash
npx serve . -l 5500
```

Then open `http://localhost:5500`, with the LDE backend running on port 3001. Port 5500
is used because the LDE frontend already takes 3000; any free port works.

The endpoint must have CORS open for `*` on `GET /v1/ropa/public`. That is
configured in `packages/backend/src/utils/publicPaths.ts`.
