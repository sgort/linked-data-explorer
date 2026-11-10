# Sign-in rollout (#163)

How to put the closed write routes and the sign-in live on ACC, then PROD. The
work spans three branches, one per repository:

| Repository           | Branch                          | What it brings                                                         |
| -------------------- | ------------------------------- | ---------------------------------------------------------------------- |
| linked-data-explorer | `feat/163-write-auth`           | backend token check (`lde-author`), anonymous test deploy, LDE sign-in |
| ttl-editor           | `feat/163-sign-in`              | sign-in, Deploy / Test deploy / Publish states, e2e sign-in            |
| ronl-business-api    | `feat/163-lde-keycloak-clients` | `scripts/keycloak-add-lde-clients.sh`                                  |

The order below matters in one place: **the LDE backend refuses to start on ACC
or PROD without `KEYCLOAK_URL`** (`validateConfig`). Set it before the LDE pull
request deploys, or the backend goes down with the deploy.

## Facts used below

|                         | ACC                                             | PROD                                        |
| ----------------------- | ----------------------------------------------- | ------------------------------------------- |
| Keycloak                | `https://acc.keycloak.open-regels.nl`           | `https://keycloak.open-regels.nl`           |
| LDE frontend origin     | `https://acc.linkeddata.open-regels.nl`         | `https://linkeddata.open-regels.nl`         |
| ttl-editor origin       | `https://acc.cpsv.open-regels.nl`               | `https://cpsv.open-regels.nl`               |
| LDE backend App Service | `ronl-linkeddata-backend-acc`                   | `ronl-linkeddata-backend-prod`              |
| LDE backend URL         | `https://acc.backend.linkeddata.open-regels.nl` | `https://backend.linkeddata.open-regels.nl` |

Both App Services: subscription "PDR - C1380", resource group `RONL-Preproduction`.

Locally: Keycloak `http://localhost:8080`; the LDE frontend and ttl-editor both
serve on `http://localhost:3000` (one at a time; ttl-editor uses `strictPort`).

## ACC

1. **Keycloak.** In ronl-business-api, run the script against ACC with the ACC
   origins, in your own terminal (it prompts for passwords):

   ```bash
   KEYCLOAK_URL=https://acc.keycloak.open-regels.nl \
   LDE_ORIGIN=https://acc.linkeddata.open-regels.nl \
   TTL_ORIGIN=https://acc.cpsv.open-regels.nl \
     bash scripts/keycloak-add-lde-clients.sh --with-e2e --with-test-author
   ```

   It creates the realm role `lde-author`, the public clients
   `linked-data-explorer` and `ttl-editor`, the confidential client `lde-e2e`
   with its user, and `test-author-flevoland`. It prints `LDE_E2E_CLIENT_SECRET`
   once; keep it for step 4. Re-running is safe.

2. **Roles.** Give `lde-author` to everyone who must save, deploy or publish
   (Keycloak admin console, realm `ronl`, Users, Role mapping). A user who signs
   in through Entra ("Flevoland-account") exists in Keycloak only after their
   first sign-in: let them sign in once, then assign the role. They see "View
   only" until they sign in again.

3. **Backend settings** on `ronl-linkeddata-backend-acc`:
   `KEYCLOAK_URL=https://acc.keycloak.open-regels.nl` and
   `TEST_DEPLOY_ENABLED=true`. The assistant cannot write App Service settings;
   it hands over a script (`! bash ~/<name>.sh`), after which:
   - confirm with `az webapp config appsettings list ... --query "[?name=='KEYCLOAK_URL']"`;
   - check `uptime` on `/v1/health`; restart if it did not restart;
   - the settings take effect with the new backend in step 5. The old backend
     ignores them, so setting them first is harmless.

4. **e2e secrets.** `LDE_E2E_CLIENT_SECRET` and the `lde-e2e` password go where
   the e2e runs read them (`KEYCLOAK_URL`, `LDE_E2E_USERNAME`,
   `LDE_E2E_PASSWORD`, `LDE_E2E_CLIENT_SECRET` for the LDE fixtures deploy;
   `E2E_LDE_PASSWORD` for the ttl-editor journeys). Never in a repository.

5. **Merge the three pull requests**, LDE and ttl-editor in the same release, so
   no frontend is live without sign-in while the backend already checks tokens.
   The RBA one only adds a script and can go any time before step 1 on PROD.

6. **Check ACC:**
   - `curl -i -X POST https://acc.backend.linkeddata.open-regels.nl/v1/dmns/drd/deploy`
     answers `401`;
   - `curl https://acc.backend.linkeddata.open-regels.nl/v1/dmns/deploy/options`
     shows `"enabled": true`;
   - LDE: signed out, Deploy is locked and a BPMN save says "only in this
     browser"; signed in as `test-author-flevoland`, Deploy works;
   - ttl-editor: signed out, "Test deploy to Operaton" deploys and evaluates, and
     the deployment appears in Operaton under tenant `TestOnly`; signed in as an
     author, Deploy and Publish work;
   - a user without the role sees "View only".

## PROD

The same steps, with three differences:

- step 1 **without** `--with-e2e` and `--with-test-author` (the script refuses
  them on PROD anyway);
- step 3: `KEYCLOAK_URL=https://keycloak.open-regels.nl` only;
  `TEST_DEPLOY_ENABLED` stays unset, so there is no anonymous test deploy. Optionally
  `AUTH_CLIENTS=linked-data-explorer,ttl-editor`, since PROD has no `lde-e2e`
  client;
- step 6: `/v1/dmns/deploy/options` shows `"enabled": false`, and ttl-editor
  signed out shows a locked Deploy.

## Known limits

- **Pull-request previews do not sign in.** Their origins are not registered in
  Keycloak. Previews can still be used signed out.
- **Test deploys are removed after 48 hours** by the backend's hourly sweep of
  tenant `TestOnly`. A restart only delays the sweep.
- **The Content-Security-Policy is report-only.** With Keycloak configured it
  allows the session-check frame (`frame-src 'self' <keycloak>`,
  `frame-ancestors 'self'`); watch `/v1/csp-reports` after the release.
- **A new Keycloak instance** (ronl-business-api #434) needs step 1 again; the
  realm import file does not carry these clients.
