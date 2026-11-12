/**
 * Sign-in for the backend's state-changing routes (#163).
 *
 * Accepts a Keycloak access token from realm `ronl` (Bearer), issued to one of
 * the configured clients (`azp`), and requires the realm role `lde-author`.
 * Follows ronl-business-api's `packages/backend/src/auth/jwt.middleware.ts`:
 * jsonwebtoken plus jwks-rsa against the realm's certs endpoint.
 *
 * - `requireAuthor`: no or invalid token -> 401 UNAUTHENTICATED; valid token
 *   without the role -> 403 FORBIDDEN.
 * - `optionalAuthor`: no Authorization header -> continue anonymously; a header
 *   that is present is checked exactly as `requireAuthor` does, so a bad token is
 *   refused rather than quietly treated as anonymous.
 *
 * On success both put the caller in `res.locals.user` (`AuthUser`).
 */
import { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt, { GetPublicKeyOrSecret, JwtPayload } from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

import { config } from '../utils/config';
import logger from '../utils/logger';
import { sendProblem } from '../utils/problem';

export interface AuthUser {
  sub: string;
  username?: string;
  name?: string;
  roles: string[];
}

interface AuthOptions {
  getKey: GetPublicKeyOrSecret;
  issuer: string;
  clients: string[];
  role: string;
}

type Outcome = { ok: true; user: AuthUser; isAuthor: boolean } | { ok: false; reason: string };

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match ? match[1] : null;
}

export function createAuth(opts: AuthOptions): {
  requireAuthor: RequestHandler;
  optionalAuthor: RequestHandler;
} {
  const verify = (token: string): Promise<Outcome> =>
    new Promise((resolve) => {
      jwt.verify(
        token,
        opts.getKey,
        { issuer: opts.issuer, algorithms: ['RS256'] },
        (err, decoded) => {
          if (err || !decoded || typeof decoded === 'string') {
            resolve({ ok: false, reason: err?.message ?? 'malformed token' });
            return;
          }
          const payload = decoded as JwtPayload & {
            azp?: string;
            preferred_username?: string;
            name?: string;
            realm_access?: { roles?: string[] };
          };
          if (!payload.azp || !opts.clients.includes(payload.azp)) {
            resolve({ ok: false, reason: `token issued to client '${payload.azp ?? ''}'` });
            return;
          }
          const roles = payload.realm_access?.roles ?? [];
          const user: AuthUser = {
            sub: String(payload.sub ?? ''),
            ...(payload.preferred_username ? { username: payload.preferred_username } : {}),
            ...(payload.name ? { name: payload.name } : {}),
            roles,
          };
          resolve({ ok: true, user, isAuthor: roles.includes(opts.role) });
        }
      );
    });

  const check = async (
    req: Request,
    res: Response,
    next: NextFunction,
    optional: boolean
  ): Promise<void> => {
    if (optional && !req.headers.authorization) {
      next();
      return;
    }
    const token = bearerToken(req);
    if (!token) {
      sendProblem(res, req, {
        status: 401,
        code: 'UNAUTHENTICATED',
        detail: 'Sign in to do this: a Bearer token from realm ronl is required.',
      });
      return;
    }
    const outcome = await verify(token);
    if (!outcome.ok) {
      logger.warn('Token refused', { path: req.path, reason: outcome.reason });
      sendProblem(res, req, {
        status: 401,
        code: 'UNAUTHENTICATED',
        detail: 'The sign-in token is invalid or has expired. Sign in again.',
      });
      return;
    }
    if (!outcome.isAuthor) {
      sendProblem(res, req, {
        status: 403,
        code: 'FORBIDDEN',
        detail: `You need the role ${opts.role} to do this.`,
      });
      return;
    }
    res.locals.user = outcome.user;
    next();
  };

  return {
    requireAuthor: (req, res, next) => {
      void check(req, res, next, false);
    },
    optionalAuthor: (req, res, next) => {
      void check(req, res, next, true);
    },
  };
}

const realmUrl = `${config.auth.keycloakUrl}/realms/${config.auth.realm}`;

const keys = jwksClient({
  jwksUri: `${realmUrl}/protocol/openid-connect/certs`,
  cache: true,
  rateLimit: true,
});

const getKey: GetPublicKeyOrSecret = (header, callback) => {
  keys.getSigningKey(header.kid, (err, key) => {
    if (err) {
      logger.error('Failed to get signing key', { error: err.message, kid: header.kid });
      callback(err);
      return;
    }
    callback(null, key?.getPublicKey());
  });
};

const defaultAuth = createAuth({
  getKey,
  issuer: realmUrl,
  clients: config.auth.clients,
  role: config.auth.role,
});

export const requireAuthor: RequestHandler = defaultAuth.requireAuthor;
export const optionalAuthor: RequestHandler = defaultAuth.optionalAuthor;
