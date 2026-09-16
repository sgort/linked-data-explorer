import cors from 'cors';
import { RequestHandler } from 'express';

import { config } from '../utils/config';
import { isPublicPath } from '../utils/publicPaths';

type CorsCallback = (error: Error | null, allow?: boolean) => void;

const allowedOrigins = config.corsOrigin.map((o) => o.trim());

/**
 * Credentialed allowlist, applied to everything that is not a public mount.
 */
export const corsOptions: cors.CorsOptions = {
  origin: (origin: string | undefined, callback: CorsCallback): void => {
    // Allow non-browser requests (curl, server-to-server)
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    // Refuse by omitting Access-Control-Allow-Origin, not by failing the
    // middleware. The cors package forwards a non-null first argument to
    // next(err), which reaches the error handler and answers an unlisted origin
    // with a 500 INTERNAL_ERROR envelope, implying the backend broke. The
    // request completes normally and the browser enforces the policy (#145).
    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Dso-Env'],
};

// Wildcard by design, for the public read-only mounts only -- see utils/publicPaths.ts.
// nosemgrep: javascript.express.web.cors-permissive-express.cors-permissive-express
const publicCors = cors({ origin: '*', methods: ['GET', 'OPTIONS'] });

const allowlistCors = cors(corsOptions);

/**
 * Applies wildcard CORS to the public read-only mounts and the credentialed
 * allowlist to everything else. Mounted for both normal requests and preflight.
 */
export const corsMiddleware: RequestHandler = (req, res, next) => {
  if (isPublicPath(req.path)) {
    publicCors(req, res, next);
  } else {
    allowlistCors(req, res, next);
  }
};
