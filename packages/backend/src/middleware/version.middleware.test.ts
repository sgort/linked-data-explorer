import { Request, Response } from 'express';

import packageJson from '../../package.json';
import { deprecationMiddleware, versionMiddleware } from './version.middleware';

function mockReqRes() {
  const req = {} as Request;
  const res = { set: jest.fn() } as unknown as Response;
  const next = jest.fn();
  return { req, res, next };
}

describe('versionMiddleware', () => {
  test('sets the API-Version header from package.json and calls next', () => {
    const { req, res, next } = mockReqRes();

    versionMiddleware(req, res, next);

    expect(res.set).toHaveBeenCalledWith('API-Version', packageJson.version);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('deprecationMiddleware', () => {
  test('sets Deprecation and Link headers pointing at the successor path, then calls next', () => {
    const { req, res, next } = mockReqRes();
    const middleware = deprecationMiddleware('/v1/norms');

    middleware(req, res, next);

    expect(res.set).toHaveBeenCalledWith('Deprecation', 'true');
    expect(res.set).toHaveBeenCalledWith('Link', '</v1/norms>; rel="successor-version"');
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('returns a fresh middleware function per successor path', () => {
    const middlewareA = deprecationMiddleware('/v1/a');
    const middlewareB = deprecationMiddleware('/v1/b');
    expect(middlewareA).not.toBe(middlewareB);
  });
});
