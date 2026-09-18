import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import { getErrorMessage, getErrorDetails } from '../utils/errors';
import { sendProblem } from '../utils/problem';

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

  sendProblem(res, req, {
    status: 500,
    code: 'INTERNAL_ERROR',
    detail: process.env.NODE_ENV === 'production' ? 'Internal server error' : getErrorMessage(err),
    extensions: {
      details: process.env.NODE_ENV === 'development' ? errorDetails.stack : undefined,
    },
  });
};

/**
 * 404 handler
 */
export const notFoundHandler = (req: Request, res: Response) => {
  sendProblem(res, req, {
    status: 404,
    code: 'NOT_FOUND',
    detail: `Endpoint not found: ${req.method} ${req.path}`,
  });
};
