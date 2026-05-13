import express, { Express } from 'express';
import cors from 'cors';
import dmnXmlRoutes from './routes/dmn-xml.routes';
import helmet from 'helmet';
import { config } from './utils/config';
import logger from './utils/logger';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { versionMiddleware } from './middleware/version.middleware';
import { externalTaskWorker } from './services/externalTaskWorker.service';
import { migrate } from './db/migrate';
import { rootHandler } from './utils/rootViews';

const app: Express = express();

type CorsCallback = (error: Error | null, allow?: boolean) => void;

const allowedOrigins = config.corsOrigin.map((o) => o.trim());

const corsOptions: cors.CorsOptions = {
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

    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Dso-Env'],
};

// Security middleware
app.use(helmet());

// apply CORS to both normal requests and preflight
const isPublicPath = (path: string) =>
  path.startsWith('/v1/ropa/public') || path.startsWith('/v1/bundles/public');

app.use((req, res, next) => {
  if (isPublicPath(req.path)) {
    cors({ origin: '*', methods: ['GET', 'OPTIONS'] })(req, res, next);
  } else {
    cors(corsOptions)(req, res, next);
  }
});
app.options('*', (req, res, next) => {
  if (isPublicPath(req.path)) {
    cors({ origin: '*', methods: ['GET', 'OPTIONS'] })(req, res, next);
  } else {
    cors(corsOptions)(req, res, next);
  }
});

// Register /api/dmns XML route BEFORE body-parsing middleware.
// dmnXmlRoutes streams raw XML (Content-Type: application/xml), so it must not
// pass through express.json(), which would attempt to parse the body as JSON.
app.use('/api/dmns', dmnXmlRoutes);

// Body parsing middleware — only applied to routes registered after this point.
// The 10 MB limit accommodates large BPMN/DMN XML payloads submitted for deployment.
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
  });
  next();
});

// API version middleware (adds API-Version header to all responses)
app.use(versionMiddleware);

// Mount API routes (routes already include /api and /v1 prefixes)
app.use(routes);

// Root endpoint — content-negotiated. Browsers (Accept: text/html) get a
// rendered HTML landing page; programmatic clients get JSON. Both views are
// derived from the shared route registry. See src/utils/rootView.ts and
// src/routes/registry.ts.
app.get('/', rootHandler);

// 404 handler (must be after all routes)
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// Start server
const startServer = async () => {
  await migrate();
  const port = config.port;
  const host = config.host;

  app.listen(port, host, () => {
    logger.info(`Server started`, {
      environment: config.nodeEnv,
      host,
      port,
      corsOrigin: config.corsOrigin,
      triplydbEndpoint: config.triplydb.endpoint,
      operatonBaseUrl: config.operaton.baseUrl,
    });

    logger.info(`API available at: http://${host}:${port}/v1`);
    logger.info(`Health check: http://${host}:${port}/v1/health`);
    logger.info(`Legacy API: http://${host}:${port}/api (deprecated)`);

    externalTaskWorker.start();
  });
};

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  externalTaskWorker.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  externalTaskWorker.stop();
  process.exit(0);
});

// Start the server
startServer();

export default app;