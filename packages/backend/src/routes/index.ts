// packages/backend/src/routes/index.ts
// Mounts v1 routes from the shared registry plus legacy /api/* deprecation
// aliases. The v1 list is intentionally not maintained here — see registry.ts.

import { Router, Request, Response, NextFunction } from 'express';
import { routeRegistry } from './registry';

// Legacy route imports — kept inline because the /api/* aliases are deprecated
// and intentionally not part of the registry (the root response and HTML page
// list v1 only, which is what we want consumers to migrate towards).
import healthRoutes from './health.routes';
import dmnRoutes from './dmn.routes';
import chainRoutes from './chain.routes';
import templateRoutes from './template.routes';
import triplydbRoutes from './triplydb.routes';
import cacheRoutes from './cache.routes';
import vendorRoutes from './vendor.routes';

const router = Router();

// Deprecation middleware helper for legacy /api/* aliases. Sets the standard
// `Deprecation: true` and `Link: <successor>; rel="successor-version"` headers
// per RFC 8594, so clients can detect they're on a deprecated path and discover
// the v1 replacement programmatically.
const deprecationMiddleware = (successorPath: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.set('Deprecation', 'true');
    res.set('Link', `<${successorPath}>; rel="successor-version"`);
    next();
  };
};

// Mount v1 routes from the registry. Express matches in registration order, so
// the registry doubles as a route precedence spec — see the IMPORTANT note at
// the top of registry.ts.
for (const { mount, router: routerImpl } of routeRegistry) {
  router.use(mount, routerImpl);
}

// Legacy /api/* routes (deprecated but still working). Hand-mounted because
// they are intentionally excluded from the registry — see comment above.
router.use('/api/health', deprecationMiddleware('/v1/health'), healthRoutes);
router.use('/api/dmns', deprecationMiddleware('/v1/dmns'), dmnRoutes);
router.use('/api/cache', deprecationMiddleware('/v1/cache'), cacheRoutes);
router.use('/api/chains/templates', deprecationMiddleware('/v1/chains/templates'), templateRoutes);
router.use('/api/chains', deprecationMiddleware('/v1/chains'), chainRoutes);
router.use('/api/triplydb', deprecationMiddleware('/v1/triplydb'), triplydbRoutes);
router.use('/api/vendors', deprecationMiddleware('/v1/vendors'), vendorRoutes);

export default router;
