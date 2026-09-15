// packages/backend/src/routes/openapi.routes.ts
//
// GET /v1/openapi.json: this API's OpenAPI description, at the standard
// location /core/publish-openapi prescribes (#129).

import { Request, Response, Router } from 'express';
import cors from 'cors';

import { OpenApiDocument, readOpenApiDocument } from '../openapi/document';
import { getErrorMessage } from '../utils/errors';
import logger from '../utils/logger';

export function createOpenApiRouter(load: () => OpenApiDocument = readOpenApiDocument): Router {
  const router = Router();
  let cached: OpenApiDocument | undefined;

  // Fully open CORS: /core/publish-openapi requires that any origin can fetch the
  // document, so a browser-based viewer can load it. Kept although index.ts
  // already applies it, so the router is correct when mounted on its own, as its
  // tests do. Public, read-only, no credentials; see utils/publicPaths.ts.
  // nosemgrep: javascript.express.web.cors-permissive-express.cors-permissive-express
  router.use(cors({ origin: '*', methods: ['GET', 'OPTIONS'] }));

  router.get('/', (_req: Request, res: Response) => {
    try {
      // Read once: the file is part of the deploy artifact and changes only with
      // a redeploy, which restarts the process. A failed read is not cached.
      cached ??= load();
      res.json(cached);
    } catch (err) {
      logger.error('[openapi] document unavailable', { error: getErrorMessage(err) });
      res.status(500).json({
        success: false,
        error: {
          code: 'OPENAPI_UNAVAILABLE',
          message: 'The OpenAPI description is not available',
        },
      });
    }
  });

  return router;
}

export default createOpenApiRouter();
