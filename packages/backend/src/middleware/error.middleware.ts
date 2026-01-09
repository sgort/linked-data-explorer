import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import { ApiResponse } from '../types/api.types';
import { getErrorMessage, getErrorDetails } from '../utils/errors';

/**
 * Global error handling middleware
 */
export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const errorDetails = getErrorDetails(err);

  logger.error('Unhandled error', {
    ...errorDetails,
    path: req.path,
    method: req.method,
  });

  const response: ApiResponse = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message:
        process.env.NODE_ENV === 'production' ? 'Internal server error' : getErrorMessage(err),
      details: process.env.NODE_ENV === 'development' ? errorDetails.stack : undefined,
    },
    timestamp: new Date().toISOString(),
  };

  res.status(500).json(response);
};

/**
 * 404 handler
 */
export const notFoundHandler = (req: Request, res: Response) => {
  const response: ApiResponse = {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Endpoint not found: ${req.method} ${req.path}`,
    },
    timestamp: new Date().toISOString(),
  };

  res.status(404).json(response);
};
