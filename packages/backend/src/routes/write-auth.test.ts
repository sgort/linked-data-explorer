/**
 * #163: every state-changing route needs a sign-in, on every mount -- the
 * deprecated /api/* aliases included, since the LDE frontend still calls
 * /api/cache/clear and /api/dmns/process/deploy. Mounts the real routers; a
 * request without a token must be refused before any service is reached.
 */
import express from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

// rdf-validate-shacl ships ESM that Jest does not transform; the SHACL routes
// are only probed for "not 401" here.
jest.mock('../services/shacl-validation.service', () => ({
  __esModule: true,
  shaclValidationService: {
    getLayerStatus: jest.fn(),
    validateFile: jest.fn().mockResolvedValue({ conforms: true, results: [] }),
    validateMerged: jest.fn(),
  },
}));

import routes from './index';

const app = express();
app.use(express.json());
app.use(routes);

const CLOSED: Array<[string, string]> = [
  ['post', '/v1/assets/bpmn'],
  ['delete', '/v1/assets/bpmn/x'],
  ['patch', '/v1/assets/bpmn/x/deploy'],
  ['post', '/v1/assets/forms'],
  ['delete', '/v1/assets/forms/x'],
  ['post', '/v1/assets/documents'],
  ['delete', '/v1/assets/documents/x'],
  ['post', '/v1/assets/ropa'],
  ['delete', '/v1/assets/ropa/x'],
  ['delete', '/v1/cache/clear'],
  ['delete', '/api/cache/clear'],
  ['post', '/v1/triplydb/update-service'],
  ['post', '/api/triplydb/update-service'],
  ['post', '/v1/dmns/drd/deploy'],
  ['post', '/v1/dmns/process/deploy'],
  ['post', '/api/dmns/process/deploy'],
  ['post', '/api/dmns/drd/deploy'],
];

type Method = 'get' | 'post' | 'patch' | 'delete';

describe('POST /dmns/deploy without a sign-in where test deploys are off (PROD)', () => {
  test.each(['/v1/dmns/deploy', '/api/dmns/deploy'])('%s answers 401', async (path) => {
    const res = await request(app)
      .post(path)
      .send({ xml: '<definitions><decision id="k"/></definitions>', deploymentName: 'k' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });
});

describe('state-changing routes refuse a request without a sign-in', () => {
  test.each(CLOSED)('%s %s answers 401', async (method, path) => {
    const res = await request(app)[method as Method](path).send({});
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });
});

// Probes that touch no database or network: the asset reads query the local
// Postgres when DATABASE_URL is set, and time out under a parallel run.
describe('reading, validating and computing stay open', () => {
  test.each([
    ['get', '/v1/openapi.json'],
    ['post', '/v1/dmns/validate'],
    ['post', '/v1/shacl/validate'],
    ['post', '/v1/chains/execute'],
    ['get', '/v1/dmns/process/deploy-target'],
  ])('%s %s is not refused for want of a sign-in', async (method, path) => {
    const res = await request(app)[method as Method](path).send({});
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
