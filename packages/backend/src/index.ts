import express, { Express } from 'express';
import dmnXmlRoutes from './routes/dmn-xml.routes';
import helmet from 'helmet';
import { config } from './utils/config';
import logger from './utils/logger';
import routes from './routes';
import { corsMiddleware } from './middleware/cors.middleware';
import { errorHandler, notFoundHandler, BODY_SIZE_LIMIT } from './middleware/error.middleware';
import { versionMiddleware } from './middleware/version.middleware';
import { externalTaskWorker } from './services/externalTaskWorker.service';
import { migrate } from './db/migrate';
import { rootHandler } from './utils/rootViews';

const app: Express = express();

// Security middleware
app.use(helmet());

// apply CORS to both normal requests and preflight
app.use(corsMiddleware);
app.options('*', corsMiddleware);

// Register /api/dmns XML route BEFORE body-parsing middleware.
// dmnXmlRoutes streams raw XML (Content-Type: application/xml), so it must not
// pass through express.json(), which would attempt to parse the body as JSON.
app.use('/api/dmns', dmnXmlRoutes);

// Body parsing middleware — only applied to routes registered after this point.
// The 10 MB limit accommodates large BPMN/DMN XML payloads submitted for deployment.
// BODY_SIZE_LIMIT also drives the 413 `detail` the error handler sends when a
// body goes over it — see middleware/error.middleware.ts.
app.use(express.json({ limit: BODY_SIZE_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_SIZE_LIMIT }));

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
