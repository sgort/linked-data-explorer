import express from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../services/operaton.service', () => ({
  operatonService: {
    deployProcess: jest.fn(),
    assembleDrd: jest.fn(),
    deployDrd: jest.fn(),
    fetchDmnXml: jest.fn(),
    evaluateRaw: jest.fn(),
  },
}));
jest.mock('../services/sparql.service', () => ({
  sparqlService: {
    getAllDmns: jest.fn(),
    getDmnByIdentifier: jest.fn(),
    findSemanticEquivalences: jest.fn(),
    findEnhancedChainLinks: jest.fn(),
    detectChainCycles: jest.fn(),
  },
}));
// Mocking the validator also keeps its native libxmljs2 dependency out of the
// test run; the validation rules have their own suite.
jest.mock('../services/dmn-validation.service', () => ({
  dmnValidationService: { validateDmnContent: jest.fn() },
}));

import { dmnValidationService } from '../services/dmn-validation.service';
import { operatonService } from '../services/operaton.service';
import { sparqlService } from '../services/sparql.service';
import dmnRoutes from './dmn.routes';

const operaton = operatonService as unknown as Record<string, jest.Mock>;
const sparql = sparqlService as unknown as Record<string, jest.Mock>;
const mockDeployProcess = operaton.deployProcess;
const mockValidate = dmnValidationService.validateDmnContent as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/dmns', dmnRoutes);
  return app;
}

beforeEach(() => {
  for (const fn of [...Object.values(operaton), ...Object.values(sparql), mockValidate]) {
    if (typeof fn === 'function') fn.mockReset();
  }
});

describe('GET /api/dmns', () => {
  test('lists the DMNs, each enriched with an XML download link', async () => {
    sparql.getAllDmns.mockResolvedValue([
      { identifier: 'SVB_LeeftijdsInformatie', name: 'Leeftijd' },
      { identifier: 'BD_Zorgtoeslag', name: 'Zorgtoeslag' },
    ]);

    const res = await request(makeApp()).get('/api/dmns');

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.dmns[0]).toEqual({
      identifier: 'SVB_LeeftijdsInformatie',
      name: 'Leeftijd',
      xmlUrl: '/v1/dmns/SVB_LeeftijdsInformatie/xml',
    });
  });

  test('URL-encodes the identifier in the generated link', async () => {
    sparql.getAllDmns.mockResolvedValue([{ identifier: 'SVB Leeftijd/2026' }]);

    const res = await request(makeApp()).get('/api/dmns');

    expect(res.body.data.dmns[0].xmlUrl).toBe('/v1/dmns/SVB%20Leeftijd%2F2026/xml');
  });

  test('uses the default endpoint and the cache when nothing is requested', async () => {
    sparql.getAllDmns.mockResolvedValue([]);

    const res = await request(makeApp()).get('/api/dmns');

    expect(sparql.getAllDmns).toHaveBeenCalledWith(undefined, false);
    expect(res.body.data.fromCache).toBe(true);
  });

  test('forwards a custom endpoint', async () => {
    sparql.getAllDmns.mockResolvedValue([]);

    await request(makeApp())
      .get('/api/dmns')
      .query({ endpoint: 'https://triplydb.example/sparql' });

    expect(sparql.getAllDmns).toHaveBeenCalledWith('https://triplydb.example/sparql', false);
  });

  test.each(['true', '1'])('refresh=%s bypasses the cache', async (value) => {
    sparql.getAllDmns.mockResolvedValue([]);

    const res = await request(makeApp()).get('/api/dmns').query({ refresh: value });

    expect(sparql.getAllDmns).toHaveBeenCalledWith(undefined, true);
    expect(res.body.data.fromCache).toBe(false);
  });

  test('any other refresh value leaves the cache in play', async () => {
    sparql.getAllDmns.mockResolvedValue([]);

    await request(makeApp()).get('/api/dmns').query({ refresh: 'yes' });

    expect(sparql.getAllDmns).toHaveBeenCalledWith(undefined, false);
  });

  test('returns 500 with a QUERY_ERROR code when the lookup throws', async () => {
    sparql.getAllDmns.mockRejectedValue(new Error('SPARQL endpoint unreachable'));

    const res = await request(makeApp()).get('/api/dmns');

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: 'QUERY_ERROR', message: 'SPARQL endpoint unreachable' },
    });
  });
});

describe('chain analysis endpoints', () => {
  const cases = [
    ['/api/dmns/semantic-equivalences', 'findSemanticEquivalences'],
    ['/api/dmns/enhanced-chain-links', 'findEnhancedChainLinks'],
    ['/api/dmns/cycles', 'detectChainCycles'],
  ] as const;

  test.each(cases)('GET %s returns the service result', async (path, fn) => {
    sparql[fn].mockResolvedValue([{ from: 'A', to: 'B' }]);

    const res = await request(makeApp()).get(path);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ from: 'A', to: 'B' }]);
  });

  test.each(cases)('GET %s forwards the endpoint override', async (path, fn) => {
    sparql[fn].mockResolvedValue([]);

    await request(makeApp()).get(path).query({ endpoint: 'https://triplydb.example/sparql' });

    expect(sparql[fn]).toHaveBeenCalledWith('https://triplydb.example/sparql');
  });

  test.each(cases)('GET %s maps a failure to 500 QUERY_ERROR', async (path, fn) => {
    sparql[fn].mockRejectedValue(new Error('SPARQL timeout'));

    const res = await request(makeApp()).get(path);

    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({ code: 'QUERY_ERROR', message: 'SPARQL timeout' });
  });

  test.each(cases)('GET %s is not captured by the /:identifier route', async (path, fn) => {
    sparql[fn].mockResolvedValue([]);

    await request(makeApp()).get(path);

    expect(sparql.getDmnByIdentifier).not.toHaveBeenCalled();
  });
});

describe('POST /api/dmns/drd/deploy', () => {
  test('assembles and deploys the DRD, naming it after the entry-point decision', async () => {
    operaton.assembleDrd.mockResolvedValue('<definitions/>');
    operaton.deployDrd.mockResolvedValue({ deploymentId: 'dep-1' });

    const res = await request(makeApp())
      .post('/api/dmns/drd/deploy')
      .send({ dmnIds: ['A', 'B', 'Entry'], deploymentName: 'ZorgtoeslagDRD' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      deploymentId: 'dep-1',
      entryPointId: 'Entry',
      filename: 'Entry.dmn',
      dmnCount: 3,
    });
    expect(operaton.assembleDrd).toHaveBeenCalledWith(['A', 'B', 'Entry'], 'ZorgtoeslagDRD');
    expect(operaton.deployDrd).toHaveBeenCalledWith(
      '<definitions/>',
      'ZorgtoeslagDRD',
      'Entry.dmn'
    );
  });

  test.each([
    ['a missing dmnIds array', { deploymentName: 'X' }],
    ['a single-entry chain, which is not a DRD', { dmnIds: ['A'], deploymentName: 'X' }],
    ['an empty chain', { dmnIds: [], deploymentName: 'X' }],
    ['a non-array dmnIds', { dmnIds: 'A,B', deploymentName: 'X' }],
  ])('rejects %s with 400', async (_label, body) => {
    const res = await request(makeApp()).post('/api/dmns/drd/deploy').send(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({
      code: 'INVALID_INPUT',
      message: 'dmnIds must be an array with at least 2 entries',
    });
    expect(operaton.assembleDrd).not.toHaveBeenCalled();
  });

  test.each([
    ['a missing deploymentName', { dmnIds: ['A', 'B'] }],
    ['a blank deploymentName', { dmnIds: ['A', 'B'], deploymentName: '   ' }],
  ])('rejects %s with 400', async (_label, body) => {
    const res = await request(makeApp()).post('/api/dmns/drd/deploy').send(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({
      code: 'INVALID_INPUT',
      message: 'deploymentName is required',
    });
    expect(operaton.assembleDrd).not.toHaveBeenCalled();
  });

  test('returns 500 with a DRD_DEPLOY_FAILED code when assembly fails', async () => {
    operaton.assembleDrd.mockRejectedValue(new Error('unknown DMN B'));

    const res = await request(makeApp())
      .post('/api/dmns/drd/deploy')
      .send({ dmnIds: ['A', 'B'], deploymentName: 'X' });

    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({ code: 'DRD_DEPLOY_FAILED', message: 'unknown DMN B' });
  });

  test('returns 500 with a DRD_DEPLOY_FAILED code when the deploy fails', async () => {
    operaton.assembleDrd.mockResolvedValue('<definitions/>');
    operaton.deployDrd.mockRejectedValue(new Error('Operaton rejected the deployment'));

    const res = await request(makeApp())
      .post('/api/dmns/drd/deploy')
      .send({ dmnIds: ['A', 'B'], deploymentName: 'X' });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('DRD_DEPLOY_FAILED');
  });
});

describe('POST /api/dmns/process/deploy', () => {
  test('returns 400 when organization is missing', async () => {
    const res = await request(makeApp())
      .post('/api/dmns/process/deploy')
      .send({ bpmnXml: '<bpmn:definitions/>', deploymentName: 'RipR21Process' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
    expect(mockDeployProcess).not.toHaveBeenCalled();
  });

  test('returns 400 when organization is an empty string', async () => {
    const res = await request(makeApp()).post('/api/dmns/process/deploy').send({
      bpmnXml: '<bpmn:definitions/>',
      deploymentName: 'RipR21Process',
      organization: '',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });

  test('passes organization through to deployProcess as the tenant-id tag', async () => {
    mockDeployProcess.mockResolvedValue({ deploymentId: 'dep-1', resourceCount: 3 });

    const res = await request(makeApp()).post('/api/dmns/process/deploy').send({
      bpmnXml: '<bpmn:definitions/>',
      deploymentName: 'RipR21Process',
      organization: 'flevoland',
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ deploymentId: 'dep-1', resourceCount: 3 });
    expect(mockDeployProcess).toHaveBeenCalledWith(
      '<bpmn:definitions/>',
      'RipR21Process',
      [],
      [],
      [],
      undefined,
      undefined,
      undefined,
      undefined,
      'flevoland'
    );
  });

  test.each([
    ['a missing bpmnXml', { deploymentName: 'X', organization: 'flevoland' }],
    ['a blank bpmnXml', { bpmnXml: '  ', deploymentName: 'X', organization: 'flevoland' }],
  ])('rejects %s with 400', async (_label, body) => {
    const res = await request(makeApp()).post('/api/dmns/process/deploy').send(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: 'INVALID_INPUT', message: 'bpmnXml is required' });
    expect(mockDeployProcess).not.toHaveBeenCalled();
  });

  test('rejects a blank deploymentName with 400', async () => {
    const res = await request(makeApp())
      .post('/api/dmns/process/deploy')
      .send({ bpmnXml: '<bpmn:definitions/>', deploymentName: '  ', organization: 'flevoland' });

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({
      code: 'INVALID_INPUT',
      message: 'deploymentName is required',
    });
  });

  test('forwards the full artefact bundle and Operaton credentials', async () => {
    mockDeployProcess.mockResolvedValue({ deploymentId: 'dep-1', resourceCount: 5 });
    const forms = [{ id: 'f1', schema: {} }];
    const subProcesses = [{ filename: 'sub.bpmn', xml: '<bpmn/>' }];
    const documents = [{ id: 'd1', template: {} }];

    await request(makeApp()).post('/api/dmns/process/deploy').send({
      bpmnXml: '<bpmn:definitions/>',
      deploymentName: 'RipR21Process',
      forms,
      subProcesses,
      documents,
      operatonUrl: 'http://localhost:8081/engine-rest',
      operatonUsername: 'demo',
      operatonPassword: 'demo',
      boardOwner: 'flevoland',
      organization: 'flevoland',
    });

    expect(mockDeployProcess).toHaveBeenCalledWith(
      '<bpmn:definitions/>',
      'RipR21Process',
      forms,
      subProcesses,
      documents,
      'http://localhost:8081/engine-rest',
      'demo',
      'demo',
      'flevoland',
      'flevoland'
    );
  });

  test('returns 500 with a PROCESS_DEPLOY_FAILED code when the deploy throws', async () => {
    mockDeployProcess.mockRejectedValue(new Error('Operaton unreachable'));

    const res = await request(makeApp()).post('/api/dmns/process/deploy').send({
      bpmnXml: '<bpmn:definitions/>',
      deploymentName: 'RipR21Process',
      organization: 'flevoland',
    });

    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({
      code: 'PROCESS_DEPLOY_FAILED',
      message: 'Operaton unreachable',
    });
  });
});

describe('POST /api/dmns/deploy', () => {
  test('returns 400 when xml is missing', async () => {
    const res = await request(makeApp())
      .post('/api/dmns/deploy')
      .send({ deploymentName: 'test-dmn' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
    expect(operaton.deployDrd).not.toHaveBeenCalled();
  });

  test('returns 400 when deploymentName is missing', async () => {
    const res = await request(makeApp())
      .post('/api/dmns/deploy')
      .send({ xml: '<dmn:definitions/>' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
    expect(operaton.deployDrd).not.toHaveBeenCalled();
  });

  test('deploys raw XML as-is, deriving the filename from deploymentName when none is given', async () => {
    operaton.deployDrd.mockResolvedValue({ deploymentId: 'dep-1' });

    const res = await request(makeApp())
      .post('/api/dmns/deploy')
      .send({ xml: '<dmn:definitions/>', deploymentName: 'individuele-inkomenstoeslag' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ deploymentId: 'dep-1' });
    expect(operaton.deployDrd).toHaveBeenCalledWith(
      '<dmn:definitions/>',
      'individuele-inkomenstoeslag',
      'individuele-inkomenstoeslag.dmn'
    );
  });

  test('uses an explicit filename when given', async () => {
    operaton.deployDrd.mockResolvedValue({ deploymentId: 'dep-2' });

    const res = await request(makeApp()).post('/api/dmns/deploy').send({
      xml: '<dmn:definitions/>',
      deploymentName: 'test-dmn',
      filename: 'individuele inkomenstoeslag-iknow-patched.dmn',
    });

    expect(res.status).toBe(200);
    expect(operaton.deployDrd).toHaveBeenCalledWith(
      '<dmn:definitions/>',
      'test-dmn',
      'individuele inkomenstoeslag-iknow-patched.dmn'
    );
  });

  test('returns 500 with the engine error message when deployDrd rejects', async () => {
    operaton.deployDrd.mockRejectedValue(new Error('Operaton unreachable'));

    const res = await request(makeApp())
      .post('/api/dmns/deploy')
      .send({ xml: '<dmn:definitions/>', deploymentName: 'test-dmn' });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('DMN_DEPLOY_FAILED');
    expect(res.body.error.message).toBe('Operaton unreachable');
  });
});

describe('POST /api/dmns/evaluate/:decisionKey', () => {
  test('passes the decision key and variables through, returning Operaton’s raw result array', async () => {
    operaton.evaluateRaw.mockResolvedValue([{ aanspraak: { value: true, type: 'Boolean' } }]);

    const res = await request(makeApp())
      .post('/api/dmns/evaluate/_bca439b7-fdb8-40e3-8a1d-3bb95571c65c')
      .send({ variables: { woonachtig: { value: true, type: 'Boolean' } } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ aanspraak: { value: true, type: 'Boolean' } }]);
    expect(operaton.evaluateRaw).toHaveBeenCalledWith('_bca439b7-fdb8-40e3-8a1d-3bb95571c65c', {
      woonachtig: { value: true, type: 'Boolean' },
    });
  });

  test('treats a missing variables object as an empty one rather than failing', async () => {
    operaton.evaluateRaw.mockResolvedValue([]);

    const res = await request(makeApp()).post('/api/dmns/evaluate/some-key').send({});

    expect(res.status).toBe(200);
    expect(operaton.evaluateRaw).toHaveBeenCalledWith('some-key', {});
  });

  test('forwards an Operaton exception body and status verbatim (e.g. a RestException)', async () => {
    const axiosError = Object.assign(new Error('Request failed with status code 500'), {
      isAxiosError: true,
      response: {
        status: 500,
        data: { type: 'RestException', message: 'Unknown property used in expression' },
      },
    });
    operaton.evaluateRaw.mockRejectedValue(axiosError);

    const res = await request(makeApp()).post('/api/dmns/evaluate/bad-key').send({ variables: {} });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      type: 'RestException',
      message: 'Unknown property used in expression',
    });
  });

  test('falls back to a ProxyError shape for a non-axios failure', async () => {
    operaton.evaluateRaw.mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await request(makeApp())
      .post('/api/dmns/evaluate/some-key')
      .send({ variables: {} });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ type: 'ProxyError', message: 'ECONNREFUSED' });
  });
});

describe('GET /api/dmns/:identifier/xml', () => {
  test('serves the deployed DMN XML as a .dmn attachment', async () => {
    operaton.fetchDmnXml.mockResolvedValue('<definitions id="d1"/>');

    const res = await request(makeApp()).get('/api/dmns/SVB_LeeftijdsInformatie/xml');

    expect(res.status).toBe(200);
    expect(res.text).toBe('<definitions id="d1"/>');
    expect(res.headers['content-type']).toMatch(/application\/xml/);
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="SVB_LeeftijdsInformatie.dmn"'
    );
    expect(operaton.fetchDmnXml).toHaveBeenCalledWith('SVB_LeeftijdsInformatie');
  });

  test('returns 404 naming the identifier when Operaton has no such definition', async () => {
    operaton.fetchDmnXml.mockResolvedValue(null);

    const res = await request(makeApp()).get('/api/dmns/Unknown/xml');

    expect(res.status).toBe(404);
    expect(res.body.error).toEqual({
      code: 'DMN_NOT_FOUND',
      message: 'DMN definition not found in Operaton: Unknown',
    });
  });

  test('returns 500 with a DMN_FETCH_FAILED code when the fetch throws', async () => {
    operaton.fetchDmnXml.mockRejectedValue(new Error('Operaton unreachable'));

    const res = await request(makeApp()).get('/api/dmns/SVB/xml');

    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({
      code: 'DMN_FETCH_FAILED',
      message: 'Operaton unreachable',
    });
  });

  test('takes precedence over the /:identifier route', async () => {
    operaton.fetchDmnXml.mockResolvedValue('<definitions/>');

    await request(makeApp()).get('/api/dmns/SVB/xml');

    expect(sparql.getDmnByIdentifier).not.toHaveBeenCalled();
  });
});

describe('GET /api/dmns/:identifier', () => {
  test('returns the DMN enriched with its XML link', async () => {
    sparql.getDmnByIdentifier.mockResolvedValue({ identifier: 'SVB', name: 'Leeftijd' });

    const res = await request(makeApp()).get('/api/dmns/SVB');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      identifier: 'SVB',
      name: 'Leeftijd',
      xmlUrl: '/v1/dmns/SVB/xml',
    });
    expect(sparql.getDmnByIdentifier).toHaveBeenCalledWith('SVB', undefined);
  });

  test('forwards the endpoint override', async () => {
    sparql.getDmnByIdentifier.mockResolvedValue({ identifier: 'SVB' });

    await request(makeApp())
      .get('/api/dmns/SVB')
      .query({ endpoint: 'https://triplydb.example/sparql' });

    expect(sparql.getDmnByIdentifier).toHaveBeenCalledWith(
      'SVB',
      'https://triplydb.example/sparql'
    );
  });

  test('returns 404 naming the identifier when the DMN is unknown', async () => {
    sparql.getDmnByIdentifier.mockResolvedValue(null);

    const res = await request(makeApp()).get('/api/dmns/Nope');

    expect(res.status).toBe(404);
    expect(res.body.error).toEqual({ code: 'NOT_FOUND', message: 'DMN not found: Nope' });
  });

  test('returns 500 with a QUERY_ERROR code when the lookup throws', async () => {
    sparql.getDmnByIdentifier.mockRejectedValue(new Error('SPARQL timeout'));

    const res = await request(makeApp()).get('/api/dmns/SVB');

    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({ code: 'QUERY_ERROR', message: 'SPARQL timeout' });
  });
});

describe('POST /api/dmns/validate', () => {
  const RESULT = {
    valid: true,
    parseError: null,
    layers: {},
    summary: { errors: 0, warnings: 1, infos: 2 },
  };

  test('validates the posted DMN XML and returns the layered result', async () => {
    mockValidate.mockResolvedValue(RESULT);

    const res = await request(makeApp())
      .post('/api/dmns/validate')
      .send({ content: '<definitions/>' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(RESULT);
    expect(mockValidate).toHaveBeenCalledWith('<definitions/>');
  });

  test.each([
    ['a missing content field', {}],
    ['an empty content string', { content: '' }],
    ['a non-string content field', { content: { xml: '<definitions/>' } }],
  ])('rejects %s with 400 INVALID_REQUEST', async (_label, body) => {
    const res = await request(makeApp()).post('/api/dmns/validate').send(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({
      code: 'INVALID_REQUEST',
      message: 'Request body must contain a "content" field with the DMN XML as a string.',
    });
    expect(mockValidate).not.toHaveBeenCalled();
  });

  test('an invalid DMN is still a 200 — the verdict is in the payload', async () => {
    mockValidate.mockResolvedValue({
      ...RESULT,
      valid: false,
      parseError: 'Opening and ending tag mismatch',
      summary: { errors: 3, warnings: 0, infos: 0 },
    });

    const res = await request(makeApp())
      .post('/api/dmns/validate')
      .send({ content: '<definitions>' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.valid).toBe(false);
  });

  test('returns 500 with a VALIDATION_ERROR code when the validator throws', async () => {
    mockValidate.mockRejectedValue(new Error('XSD schema missing'));

    const res = await request(makeApp())
      .post('/api/dmns/validate')
      .send({ content: '<definitions/>' });

    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'XSD schema missing',
    });
  });
});
