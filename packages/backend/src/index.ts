import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './utils/config';
import logger from './utils/logger';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { versionMiddleware } from './middleware/version.middleware';
import packageJson from '../package.json';

const app: Express = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Body parsing middleware
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

// Root endpoint - FIXED: Point to v1 endpoints
app.get('/', (req, res) => {
  res.json({
    name: 'Linked Data Explorer Backend',
    version: packageJson.version,
    status: 'running',
    environment: config.nodeEnv,
    documentation: '/v1/openapi.json',
    health: '/v1/health',
    endpoints: {
      health: '/v1/health',
      dmns: '/v1/dmns',
      chains: '/v1/chains',
    },
    legacy: {
      health: '/api/health (deprecated)',
      dmns: '/api/dmns (deprecated)',
      chains: '/api/chains (deprecated)',
    },
  });
});

// 404 handler (must be after all routes)
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// Start server
const startServer = () => {
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
  });
};

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Start the server
startServer();

export default app;