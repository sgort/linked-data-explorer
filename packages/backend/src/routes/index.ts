import { Router } from 'express';
import healthRoutes from './health.routes';
import dmnRoutes from './dmn.routes';
import chainRoutes from './chain.routes';

const router = Router();

// Mount routes
router.use('/health', healthRoutes);
router.use('/dmns', dmnRoutes);
router.use('/chains', chainRoutes);

// API info endpoint
router.get('/', (req, res) => {
  res.json({
    name: 'Linked Data Explorer Backend API',
    version: '0.1.0',
    description: 'DMN orchestration and chain execution service',
    endpoints: {
      health: '/api/health',
      dmns: '/api/dmns',
      chains: '/api/chains',
    },
    documentation: 'https://github.com/ictu/linked-data-explorer',
  });
});

export default router;
