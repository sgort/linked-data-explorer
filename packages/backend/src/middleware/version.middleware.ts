// packages/backend/src/middleware/version.middleware.ts

import { Request, Response, NextFunction } from 'express';

// Import package.json for version info
import packageJson from '../../package.json';

/**
 * Version Middleware
 * 
 * Adds API-Version header to all API responses.
 * 
 * Compliance: Dutch Government API Design Rules
 * - API-57: Return the full version number in a response header
 * 
 * The version number follows Semantic Versioning (semver):
 * - MAJOR.MINOR.PATCH (e.g., 1.0.2)
 * - MAJOR: Breaking changes
 * - MINOR: New features (backward compatible)
 * - PATCH: Bug fixes (backward compatible)
 * 
 * @param req Express request object
 * @param res Express response object
 * @param next Express next function
 */
export const versionMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Set API-Version header using version from package.json
  res.set('API-Version', packageJson.version);
  
  // Continue to next middleware
  next();
};

/**
 * Deprecation Middleware
 * 
 * Adds deprecation headers to responses for deprecated endpoints.
 * Used for backward compatibility while migrating from /api/* to /v1/*
 * 
 * @param successorPath The new path that should be used instead
 */
export const deprecationMiddleware = (successorPath: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Set Deprecation header (RFC 8594)
    res.set('Deprecation', 'true');
    
    // Set Link header pointing to the successor version (RFC 8288)
    res.set('Link', `<${successorPath}>; rel="successor-version"`);
    
    // Optionally add Sunset header for end-of-life date (future)
    // res.set('Sunset', 'Sat, 31 Dec 2026 23:59:59 GMT');
    
    next();
  };
};
