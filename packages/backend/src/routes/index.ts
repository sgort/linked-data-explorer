// packages/backend/src/routes/index.ts
// UPDATED: Added triplydb and cache routes registration

import { Router, Request, Response, NextFunction } from 'express';
import healthRoutes from './health.routes';
import dmnRoutes from './dmn.routes';
import chainRoutes from './chain.routes';
import templateRoutes from './template.routes';
import triplydbRoutes from './triplydb.routes';
import cacheRoutes from './cache.routes'; // NEW: Import cache routes
import vendorRoutes from './vendor.routes';

const router = Router();

// Deprecation middleware helper
const deprecationMiddleware = (successorPath: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.set('Deprecation', 'true');
    res.set('Link', `<${successorPath}>; rel="successor-version"`);
    next();
  };
};

// API v1 routes (new - compliant)
router.use('/v1/health', healthRoutes);
router.use('/v1/dmns', dmnRoutes);
router.use('/v1/cache', cacheRoutes); // NEW: Register cache routes
router.use('/v1/chains/templates', templateRoutes);
router.use('/v1/chains', chainRoutes);
router.use('/v1/triplydb', triplydbRoutes);
router.use('/v1/vendors', vendorRoutes);

// Legacy /api/* routes (deprecated but working)
router.use('/api/health', deprecationMiddleware('/v1/health'), healthRoutes);
router.use('/api/dmns', deprecationMiddleware('/v1/dmns'), dmnRoutes);
router.use('/api/cache', deprecationMiddleware('/v1/cache'), cacheRoutes); // NEW: Legacy cache route
router.use('/api/chains/templates', deprecationMiddleware('/v1/chains/templates'), templateRoutes);
router.use('/api/chains', deprecationMiddleware('/v1/chains'), chainRoutes);
router.use('/api/triplydb', deprecationMiddleware('/v1/triplydb'), triplydbRoutes);
router.use('/api/vendors', deprecationMiddleware('/v1/vendors'), vendorRoutes);

export default router;
