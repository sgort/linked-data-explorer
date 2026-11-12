/**
 * #163: POST /v1/dmns/deploy without a sign-in deploys to tenant TestOnly when
 * test deploys are on, and the evaluate route can target that tenant.
 * The auth middleware is replaced by a stub: a request carrying
 * `x-test-user` is signed in as an lde-author, any other request is anonymous.
 */
import express from 'express';
import request from 'supertest';

jest.mock('../middleware/auth.middleware', () => {
  type Req = { headers: Record<string, string | undefined> };
  type Res = { locals: Record<string, unknown> };
  const signIn = (req: Req, res: Res, next: () => void) => {
    if (req.headers['x-test-user']) {
      res.locals.user = { sub: 'u1', roles: ['lde-author'] };
    }
    next();
  };
  return { requireAuthor: signIn, optionalAuthor: signIn };
});
jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock('../services/operaton.service', () => ({
  operatonService: {
    deployDrd: jest.fn(),
    evaluateRaw: jest.fn(),
    findDecisionTenants: jest.fn(),
  },
}));
jest.mock('../services/sparql.service', () => ({ sparqlService: {} }));
jest.mock('../services/dmn-validation.service', () => ({
  dmnValidationService: { validateDmnContent: jest.fn() },
}));
jest.mock('../services/assets.service', () => ({ recordDeployedBundle: jest.fn() }));

import { operatonService } from '../services/operaton.service';
import { resetRateSlots } from '../services/testDeploy.service';
import { config } from '../utils/config';
import dmnRoutes from './dmn.routes';
import { versionMiddleware } from '../middleware/version.middleware';
import { expectToMatchOperation } from '../openapi/testing/conformance';

const op = operatonService as unknown as Record<string, jest.Mock>;
const DMN = '<definitions id="d"><decision id="my_key" name="Mine"/></definitions>';
const body = { xml: DMN, deploymentName: 'my_key', filename: 'mine.dmn' };

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/v1/dmns', dmnRoutes);
  return app;
}

let enabled: boolean;
beforeEach(() => {
  Object.values(op).forEach((m) => m.mockReset());
  resetRateSlots();
  enabled = config.testDeploy.enabled;
  (config.testDeploy as { enabled: boolean }).enabled = true;
  op.deployDrd.mockResolvedValue({ deploymentId: 'dep-1' });
  op.findDecisionTenants.mockResolvedValue([]);
});
afterEach(() => {
  (config.testDeploy as { enabled: boolean }).enabled = enabled;
});

describe('POST /v1/dmns/deploy', () => {
  test('signed out, test deploys on, free key: deploys to TestOnly', async () => {
    const res = await request(makeApp()).post('/v1/dmns/deploy').send(body);

    expect(res.status).toBe(200);
    expect(op.deployDrd).toHaveBeenCalledWith(DMN, 'my_key', 'mine.dmn', 'TestOnly');
    expect(res.body.data.deploymentId).toBe('dep-1');
    expect(res.body.data.tenantId).toBe('TestOnly');
    const expires = Date.parse(res.body.data.expiresAt);
    expect(expires - Date.now()).toBeGreaterThan(47.9 * 3600_000);
    expect(expires - Date.now()).toBeLessThanOrEqual(48 * 3600_000);
  });

  test('signed out, any other resource name is deployed as a .dmn (final review M-2)', async () => {
    // Operaton picks the parser by extension: an anonymous `.bpmn` would be
    // parsed as a process, and a process can run code on the engine.
    for (const filename of ['evil.bpmn', 'evil.bpmn20.xml', 'evil', 'x.dmn.bpmn']) {
      op.deployDrd.mockClear();
      const res = await request(makeApp())
        .post('/v1/dmns/deploy')
        .send({ ...body, filename });
      expect(res.status).toBe(200);
      const resourceName = op.deployDrd.mock.calls[0][2] as string;
      expect(resourceName.endsWith('.dmn')).toBe(true);
      expect(resourceName).not.toMatch(/\.bpmn/);
    }
  });

  test('signed out, a deployment name ending in .bpmn without a filename still gives a .dmn', async () => {
    const res = await request(makeApp())
      .post('/v1/dmns/deploy')
      .send({ xml: DMN, deploymentName: 'evil.bpmn' });
    expect(res.status).toBe(200);
    expect(op.deployDrd.mock.calls[0][2]).toMatch(/\.dmn$/);
    expect(op.deployDrd.mock.calls[0][2]).not.toMatch(/\.bpmn/);
  });

  test('signed out, key deployed untenanted: 409 naming the key, nothing deployed', async () => {
    op.findDecisionTenants.mockResolvedValue([null]);

    const res = await request(makeApp()).post('/v1/dmns/deploy').send(body);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('TEST_DEPLOY_KEY_EXISTS');
    expect(res.body.detail).toContain('my_key');
    expect(op.deployDrd).not.toHaveBeenCalled();
  });

  test('signed out, key only under TestOnly: deploys again', async () => {
    op.findDecisionTenants.mockResolvedValue(['TestOnly']);

    const res = await request(makeApp()).post('/v1/dmns/deploy').send(body);

    expect(res.status).toBe(200);
    expect(op.deployDrd).toHaveBeenCalled();
  });

  test('signed out, a model without decisions: 400', async () => {
    const res = await request(makeApp())
      .post('/v1/dmns/deploy')
      .send({ ...body, xml: '<definitions id="d"/>' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_INPUT');
  });

  test('signed out, the 11th test deploy from one address within an hour: 429', async () => {
    for (let i = 0; i < 10; i++) {
      await request(makeApp())
        .post('/v1/dmns/deploy')
        .set('X-Forwarded-For', '203.0.113.7:1')
        .send(body);
    }
    const res = await request(makeApp())
      .post('/v1/dmns/deploy')
      .set('X-Forwarded-For', '203.0.113.7:2')
      .send(body);

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('TEST_DEPLOY_RATE_LIMITED');
  });

  test('signed out, test deploys off: 401', async () => {
    (config.testDeploy as { enabled: boolean }).enabled = false;

    const res = await request(makeApp()).post('/v1/dmns/deploy').send(body);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
    expect(op.deployDrd).not.toHaveBeenCalled();
  });

  test('signed in: deploys untenanted, without a key check', async () => {
    const res = await request(makeApp()).post('/v1/dmns/deploy').set('x-test-user', '1').send(body);

    expect(res.status).toBe(200);
    expect(op.deployDrd).toHaveBeenCalledWith(DMN, 'my_key', 'mine.dmn');
    expect(op.findDecisionTenants).not.toHaveBeenCalled();
    expect(res.body.data.tenantId).toBeUndefined();
  });
});

describe('POST /v1/dmns/evaluate/:decisionKey?tenantId=', () => {
  test('tenantId=TestOnly evaluates the test copy', async () => {
    op.evaluateRaw.mockResolvedValue([]);

    const res = await request(makeApp())
      .post('/v1/dmns/evaluate/my_key?tenantId=TestOnly')
      .send({ variables: {} });

    expect(res.status).toBe(200);
    expect(op.evaluateRaw).toHaveBeenCalledWith('my_key', {}, 'TestOnly');
  });

  test('any other tenant is refused with 400', async () => {
    const res = await request(makeApp())
      .post('/v1/dmns/evaluate/my_key?tenantId=Flevoland')
      .send({ variables: {} });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PARAM');
    expect(op.evaluateRaw).not.toHaveBeenCalled();
  });

  test('without tenantId the call is unchanged', async () => {
    op.evaluateRaw.mockResolvedValue([]);

    await request(makeApp()).post('/v1/dmns/evaluate/my_key').send({ variables: {} });

    expect(op.evaluateRaw).toHaveBeenCalledWith('my_key', {});
  });
});

describe('GET /v1/dmns/deploy/options', () => {
  test('tells the apps whether test deploys are on', async () => {
    const res = await request(makeApp()).get('/v1/dmns/deploy/options');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      testDeploy: { enabled: true, tenantId: 'TestOnly', ttlHours: 48 },
    });
  });
});

describe('test deploys match their OpenAPI description', () => {
  function makeDocumentedApp() {
    const app = express();
    app.use(express.json());
    app.use(versionMiddleware);
    app.use('/v1/dmns', dmnRoutes);
    return app;
  }

  test('POST /dmns/deploy 200 (test deploy), as documented', async () => {
    const res = await request(makeDocumentedApp()).post('/v1/dmns/deploy').send(body);
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'post', '/dmns/deploy');
  });

  test('POST /dmns/deploy 409, as documented', async () => {
    op.findDecisionTenants.mockResolvedValue([null]);
    const res = await request(makeDocumentedApp()).post('/v1/dmns/deploy').send(body);
    expect(res.status).toBe(409);
    expectToMatchOperation(res, 'post', '/dmns/deploy');
  });

  test('GET /dmns/deploy/options 200, as documented', async () => {
    const res = await request(makeDocumentedApp()).get('/v1/dmns/deploy/options');
    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/dmns/deploy/options');
  });
});
