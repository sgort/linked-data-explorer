// packages/backend/src/routes/openapi.routes.ts
//
// GET /v1/openapi.json: this API's OpenAPI description, at the standard
// location /core/publish-openapi prescribes (#129).

import { Request, Response, Router } from 'express';
import cors from 'cors';

import { OpenApiDocument, readOpenApiDocument } from '../openapi/document';
import { getErrorMessage } from '../utils/errors';
import logger from '../utils/logger';
import { sendProblem } from '../utils/problem';

export function createOpenApiRouter(load: () => OpenApiDocument = readOpenApiDocument): Router {
  const router = Router();
  let cached: OpenApiDocument | undefined;

  // Fully open CORS: /core/publish-openapi requires that any origin can fetch the
  // document, so a browser-based viewer can load it. Kept although index.ts
  // already applies it, so the router is correct when mounted on its own, as its
  // tests do. Public, read-only, no credentials; see utils/publicPaths.ts.
  // nosemgrep: javascript.express.web.cors-permissive-express.cors-permissive-express
  router.use(cors({ origin: '*', methods: ['GET', 'OPTIONS'] }));

  router.get('/', (req: Request, res: Response) => {
    try {
      // Read once per process. A failed read is not cached, so a document that
      // is not built yet is retried rather than remembered as broken.
      //
      // NOT 'changes only with a redeploy, which restarts the process', which
      // this comment used to claim and which is false: a zip deploy overwrites
      // the file BEFORE the restart. So between those two moments this process
      // can serve a document from an artifact it is not running -- which is
      // exactly what happened on the v2026.09.6 production promotion, where
      // /v1/openapi.json reported 2026.09.6 while /v1/health, bound at module
      // load, still reported 2026.09.5.
      //
      // getBuildInfo() had the same defect and the same sentence, and was made
      // eager in #211 because a stale build.sha is a false pass in the deploy
      // gate. This one is left lazy on purpose: reading eagerly would consume a
      // startup failure that 'does not cache a failed read' deliberately
      // surfaces as a 500, and #211 already closes the deploy path -- the
      // build.sha check now waits for the new process, so by the time anything
      // compares versions the read is no longer stale. Tracked on #210.
      cached ??= load();
      res.json(cached);
    } catch (err) {
      logger.error('[openapi] document unavailable', { error: getErrorMessage(err) });
      sendProblem(res, req, {
        status: 500,
        code: 'OPENAPI_UNAVAILABLE',
        detail: 'The OpenAPI description is not available',
      });
    }
  });

  return router;
}

export default createOpenApiRouter();
