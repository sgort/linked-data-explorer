/* eslint-disable @typescript-eslint/no-require-imports */
// GET /api/dmns/:identifier/xml through the real routes router (#132).
//
// A separate handler used to be mounted on the app ahead of the router, so the
// legacy path never reached the /api/dmns alias and never carried its
// deprecation headers. With that handler gone, the alias serves the path: the
// XML must still come back, now announcing /v1/dmns as its successor.
//
// The real dmn.routes is mounted through the real routes/index.ts; the other
// route modules are stubbed (as in index.test.ts) so their dependencies stay
// out of this run, and the registry is reduced to the /v1/dmns entry.

import express from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock('../services/operaton.service', () => ({
  operatonService: { fetchDmnXml: jest.fn() },
}));
jest.mock('../services/sparql.service', () => ({ sparqlService: {} }));
// Also keeps the validator's native libxmljs2 dependency out of the run.
jest.mock('../services/dmn-validation.service', () => ({ dmnValidationService: {} }));
jest.mock('../services/assets.service', () => ({ recordDeployedBundle: jest.fn() }));

function emptyRouter() {
  return () => ({ __esModule: true, default: require('express').Router() });
}
jest.mock('./health.routes', emptyRouter());
jest.mock('./cache.routes', emptyRouter());
jest.mock('./template.routes', emptyRouter());
jest.mock('./chain.routes', emptyRouter());
jest.mock('./triplydb.routes', emptyRouter());
jest.mock('./vendor.routes', emptyRouter());
jest.mock('./registry', () => ({
  __esModule: true,
  routeRegistry: [
    { mount: '/v1/dmns', router: require('./dmn.routes').default, summary: 'd', category: 'x' },
  ],
}));

import { operatonService } from '../services/operaton.service';
import routes from './index';

const fetchDmnXml = operatonService.fetchDmnXml as jest.Mock;

function makeApp() {
  const app = express();
  app.use(routes);
  return app;
}

beforeEach(() => fetchDmnXml.mockReset());

describe('GET /api/dmns/:identifier/xml (legacy alias)', () => {
  test('still returns the DMN XML', async () => {
    fetchDmnXml.mockResolvedValue('<definitions id="SVB"/>');

    const res = await request(makeApp()).get('/api/dmns/SVB_LeeftijdsInformatie/xml');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/xml/);
    expect(res.text).toBe('<definitions id="SVB"/>');
    expect(fetchDmnXml).toHaveBeenCalledWith('SVB_LeeftijdsInformatie');
  });

  test('announces its deprecation and the /v1 successor', async () => {
    fetchDmnXml.mockResolvedValue('<definitions/>');

    const res = await request(makeApp()).get('/api/dmns/SVB/xml');

    expect(res.headers.deprecation).toBe('true');
    expect(res.headers.link).toBe('</v1/dmns>; rel="successor-version"');
  });

  test('the /v1 path serves the same XML without deprecation headers', async () => {
    fetchDmnXml.mockResolvedValue('<definitions/>');

    const res = await request(makeApp()).get('/v1/dmns/SVB/xml');

    expect(res.status).toBe(200);
    expect(res.text).toBe('<definitions/>');
    expect(res.headers.deprecation).toBeUndefined();
  });
});
