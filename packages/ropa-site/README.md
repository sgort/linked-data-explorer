# ropa-site

Public-facing static site for the RONL Register van verwerkingsactiviteiten (RoPA).

Deployed as an Azure Static Web Apps resource, isolated from the LDE stack.

## What it does

Fetches active RoPA records from the LDE backend public endpoint and renders them
as a collapsible card list. No authentication required — the endpoint only returns
records with `status = 'active'`.

## Configuration

The API URL is hardcoded in `index.html`:

```
const API_URL = 'https://api.linkeddata.open-regels.nl/v1/ropa/public?organisation=flevoland';
```

Change the `organisation` query parameter to scope results to a different controller.

## Deployment

No build step. Deploy the contents of this directory directly to Azure Static Web Apps.

```bash
az staticwebapp create \
  --name ropa-flevoland \
  --resource-group rg-ronl-prod \
  --source . \
  --location westeurope \
  --branch main \
  --app-location / \
  --output-location /
```

## Local development

Open `index.html` directly in a browser, or serve with any static file server:

```bash
npx serve .
```

The API endpoint must have CORS open for `*` on `GET /v1/ropa/public` — this is
configured in `packages/backend/src/routes/ropa.public.routes.ts`.
