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
jest.mock('../services/assets.service', () => ({
  recordDeployedBundle: jest.fn(),
}));

import { dmnValidationService } from '../services/dmn-validation.service';
import { operatonService } from '../services/operaton.service';
import { sparqlService } from '../services/sparql.service';
import * as assetsService from '../services/assets.service';
import dmnRoutes from './dmn.routes';
import { versionMiddleware } from '../middleware/version.middleware';
import { expectToMatchOperation } from '../openapi/testing/conformance';

const operaton = operatonService as unknown as Record<string, jest.Mock>;
const sparql = sparqlService as unknown as Record<string, jest.Mock>;
const assets = assetsService as unknown as Record<string, jest.Mock>;
const mockDeployProcess = operaton.deployProcess;
const mockRecordDeployedBundle = assets.recordDeployedBundle;
const mockValidate = dmnValidationService.validateDmnContent as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/dmns', dmnRoutes);
  return app;
}

beforeEach(() => {
  for (const fn of [
    ...Object.values(operaton),
    ...Object.values(sparql),
    ...Object.values(assets),
    mockValidate,
  ]) {
    if (typeof fn === 'function') fn.mockReset();
  }
  // Defaults every /process/deploy test to the "bundle recorded" happy path;
  // tests exercising the storage-failure branch override this explicitly.
  mockRecordDeployedBundle.mockResolvedValue(true);
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
    expect(res.body.data).toEqual({
      deploymentId: 'dep-1',
      resourceCount: 3,
      bundleRecorded: true,
    });
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
    // bpmnXml here has no <process> element to extract an id from, so the
    // storage lookup/create key falls back to deploymentName.
    expect(mockRecordDeployedBundle).toHaveBeenCalledWith({
      bpmnProcessId: 'RipR21Process',
      bpmnXml: '<bpmn:definitions/>',
      organization: 'flevoland',
      deploymentId: 'dep-1',
      operatonUrl: 'http://localhost:8081/engine-rest',
      formIds: ['f1'],
      documentIds: ['d1'],
      boardOwner: 'flevoland',
    });
  });

  test('extracts the bpmn:process id from the XML for the storage lookup key, not deploymentName', async () => {
    mockDeployProcess.mockResolvedValue({ deploymentId: 'dep-1', resourceCount: 1 });

    await request(makeApp()).post('/api/dmns/process/deploy').send({
      bpmnXml: '<bpmn:definitions><bpmn:process id="RealProcessId"/></bpmn:definitions>',
      deploymentName: 'SomeOtherDeploymentName',
      organization: 'flevoland',
    });

    expect(mockRecordDeployedBundle).toHaveBeenCalledWith(
      expect.objectContaining({ bpmnProcessId: 'RealProcessId' })
    );
  });

  test('reports the deploy as successful but the bundle as unrecorded when storage throws', async () => {
    mockDeployProcess.mockResolvedValue({ deploymentId: 'dep-1', resourceCount: 1 });
    mockRecordDeployedBundle.mockRejectedValue(new Error('connection terminated'));

    const res = await request(makeApp()).post('/api/dmns/process/deploy').send({
      bpmnXml: '<bpmn:definitions><bpmn:process id="P"/></bpmn:definitions>',
      deploymentName: 'P',
      organization: 'flevoland',
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: {
        deploymentId: 'dep-1',
        bundleRecorded: false,
        bundleRecordingError: 'connection terminated',
      },
    });
  });

  test('reports the bundle as unrecorded (without an exception) when recordDeployedBundle resolves false', async () => {
    mockDeployProcess.mockResolvedValue({ deploymentId: 'dep-1', resourceCount: 1 });
    mockRecordDeployedBundle.mockResolvedValue(false);

    const res = await request(makeApp()).post('/api/dmns/process/deploy').send({
      bpmnXml: '<bpmn:definitions><bpmn:process id="P"/></bpmn:definitions>',
      deploymentName: 'P',
      organization: 'flevoland',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.bundleRecorded).toBe(false);
    expect(res.body.data.bundleRecordingError).toEqual(expect.stringContaining('P'));
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

describe('/v1/dmns reads match their OpenAPI description', () => {
  function makeDocumentedApp() {
    const app = express();
    app.use(express.json());
    app.use(versionMiddleware); // app-wide in index.ts
    app.use('/v1/dmns', dmnRoutes);
    return app;
  }

  // Shaped like sparqlService's DmnModel (sparql.service.ts:273-320): optional
  // fields are omitted, vendorCount is always set.
  const DMN = {
    id: 'https://regels.example/id/dmn/SVB_LeeftijdsInformatie',
    identifier: 'SVB_LeeftijdsInformatie',
    title: 'Leeftijdsinformatie',
    description: 'Bepaalt de AOW-leeftijd',
    deploymentId: 'dep-1',
    deployedAt: '2026-09-01T08:00:00Z',
    testStatus: 'passed',
    organization: 'https://regels.example/id/org/svb',
    organizationName: 'SVB',
    inputs: [{ identifier: 'geboortedatum', title: 'Geboortedatum', type: 'Date' }],
    outputs: [
      { identifier: 'aowLeeftijd', title: 'AOW-leeftijd', type: 'Integer', testValue: 67 },
      {
        identifier: 'toelichting',
        title: 'Toelichting',
        type: 'String',
        description: 'Vrije tekst',
      },
    ],
    validationStatus: 'validated',
    vendorCount: 2,
  };

  const get = (path: string) => request(makeDocumentedApp()).get(`/v1/dmns${path}`);

  test('GET /dmns 200 and 500, as documented', async () => {
    sparql.getAllDmns.mockResolvedValue([
      DMN,
      { ...DMN, identifier: 'Leeg', inputs: [], outputs: [], vendorCount: 0 },
    ]);
    const ok = await get('?refresh=true');
    expect(ok.status).toBe(200);
    expectToMatchOperation(ok, 'get', '/dmns');

    sparql.getAllDmns.mockRejectedValue(new Error('SPARQL endpoint unreachable'));
    const failed = await get('');
    expect(failed.status).toBe(500);
    expectToMatchOperation(failed, 'get', '/dmns');
  });

  test('a non-numeric Integer test value serialises as null, and still matches', async () => {
    sparql.getAllDmns.mockResolvedValue([
      { ...DMN, outputs: [{ identifier: 'x', title: 'X', type: 'Integer', testValue: NaN }] },
    ]);

    const res = await get('');

    expect(res.body.data.dmns[0].outputs[0].testValue).toBeNull();
    expectToMatchOperation(res, 'get', '/dmns');
  });

  test('GET /dmns/semantic-equivalences 200, as documented', async () => {
    const concept = (n: number) => ({
      uri: `https://regels.example/id/concept/${n}`,
      label: `Begrip ${n}`,
      variable: { uri: `https://regels.example/id/var/${n}`, identifier: `var${n}`, type: 'Date' },
    });
    sparql.findSemanticEquivalences.mockResolvedValue([
      {
        sharedConcept: 'https://begrippen.example/geboortedatum',
        concept1: { ...concept(1), notation: 'GBD' },
        concept2: concept(2),
        dmn1: { uri: 'https://regels.example/id/dmn/A', title: 'A' },
        dmn2: { uri: 'https://regels.example/id/dmn/B', title: 'B' },
      },
    ]);

    const res = await get('/semantic-equivalences');

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/dmns/semantic-equivalences');
  });

  test('GET /dmns/enhanced-chain-links 200, as documented', async () => {
    sparql.findEnhancedChainLinks.mockResolvedValue([
      {
        dmn1: { uri: 'https://regels.example/id/dmn/A', identifier: 'A', title: 'A' },
        dmn2: { uri: 'https://regels.example/id/dmn/B', identifier: 'B', title: 'B' },
        outputVariable: 'leeftijd',
        inputVariable: 'leeftijd',
        variableType: 'Integer',
        matchType: 'exact',
        sharedConcept: 'https://begrippen.example/leeftijd',
      },
    ]);

    const res = await get('/enhanced-chain-links');

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/dmns/enhanced-chain-links');
  });

  test('GET /dmns/cycles 200, as documented', async () => {
    sparql.detectChainCycles.mockResolvedValue([
      {
        path: [
          { uri: 'https://regels.example/id/dmn/A', title: 'A' },
          { uri: 'https://regels.example/id/dmn/B', title: 'B' },
          { uri: 'https://regels.example/id/dmn/C', title: 'C' },
        ],
        type: 'three-hop',
      },
    ]);

    const res = await get('/cycles');

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/dmns/cycles');
  });

  test('GET /dmns/{identifier} 200, 404 and 500, as documented', async () => {
    sparql.getDmnByIdentifier.mockResolvedValue(DMN);
    const ok = await get('/SVB_LeeftijdsInformatie');
    expect(ok.status).toBe(200);
    expectToMatchOperation(ok, 'get', '/dmns/{identifier}');

    sparql.getDmnByIdentifier.mockResolvedValue(undefined);
    const missing = await get('/Onbekend');
    expect(missing.status).toBe(404);
    expectToMatchOperation(missing, 'get', '/dmns/{identifier}');

    sparql.getDmnByIdentifier.mockRejectedValue(new Error('SPARQL timeout'));
    const failed = await get('/SVB_LeeftijdsInformatie');
    expect(failed.status).toBe(500);
    expectToMatchOperation(failed, 'get', '/dmns/{identifier}');
  });

  test('GET /dmns/{identifier}/xml 200, 404 and 500, as documented', async () => {
    operaton.fetchDmnXml.mockResolvedValue('<definitions id="d1"/>');
    const ok = await get('/SVB_LeeftijdsInformatie/xml');
    expect(ok.status).toBe(200);
    expectToMatchOperation(ok, 'get', '/dmns/{identifier}/xml');

    operaton.fetchDmnXml.mockResolvedValue(null);
    const missing = await get('/Onbekend/xml');
    expect(missing.status).toBe(404);
    expectToMatchOperation(missing, 'get', '/dmns/{identifier}/xml');

    operaton.fetchDmnXml.mockRejectedValue(new Error('Operaton unreachable'));
    const failed = await get('/SVB_LeeftijdsInformatie/xml');
    expect(failed.status).toBe(500);
    expectToMatchOperation(failed, 'get', '/dmns/{identifier}/xml');
  });
});

describe('/v1/dmns deploy, evaluate and validate match their OpenAPI description', () => {
  function makeDocumentedApp() {
    const app = express();
    app.use(express.json());
    app.use(versionMiddleware); // app-wide in index.ts
    app.use('/v1/dmns', dmnRoutes);
    return app;
  }

  const post = (path: string) => request(makeDocumentedApp()).post(`/v1/dmns${path}`);

  test('POST /dmns/evaluate/{decisionKey} passes Operaton results and errors through, as documented', async () => {
    operaton.evaluateRaw.mockResolvedValue([{ aanspraak: { value: true, type: 'Boolean' } }]);
    const rows = await post('/evaluate/zorgtoeslag').send({
      variables: { inkomen: { value: 30000, type: 'Integer' } },
    });
    expect(rows.status).toBe(200);
    expectToMatchOperation(rows, 'post', '/dmns/evaluate/{decisionKey}');

    operaton.evaluateRaw.mockResolvedValue({ aanspraak: { value: false, type: 'Boolean' } });
    const single = await post('/evaluate/zorgtoeslag').send({});
    expect(single.status).toBe(200);
    expectToMatchOperation(single, 'post', '/dmns/evaluate/{decisionKey}');

    operaton.evaluateRaw.mockRejectedValue(
      Object.assign(new Error('Request failed'), {
        isAxiosError: true,
        response: {
          status: 500,
          data: { type: 'RestException', message: 'Unknown property used in expression' },
        },
      })
    );
    const forwarded = await post('/evaluate/zorgtoeslag').send({});
    expect(forwarded.status).toBe(500);
    expectToMatchOperation(forwarded, 'post', '/dmns/evaluate/{decisionKey}');

    operaton.evaluateRaw.mockRejectedValue(
      Object.assign(new Error('Request failed'), {
        isAxiosError: true,
        response: {
          status: 400,
          data: {
            type: 'InvalidRequestException',
            message: 'Cannot convert value "abc" to type Integer',
          },
        },
      })
    );
    const rejected = await post('/evaluate/zorgtoeslag').send({});
    expect(rejected.status).toBe(400);
    expectToMatchOperation(rejected, 'post', '/dmns/evaluate/{decisionKey}');

    operaton.evaluateRaw.mockRejectedValue(new Error('ECONNREFUSED'));
    const proxy = await post('/evaluate/zorgtoeslag').send({});
    expect(proxy.status).toBe(500);
    expect(proxy.body).toEqual({ type: 'ProxyError', message: 'ECONNREFUSED' });
    expectToMatchOperation(proxy, 'post', '/dmns/evaluate/{decisionKey}');
  });

  test('POST /dmns/validate 200, 400 and 500, as documented', async () => {
    const layer = (label: string) => ({ label, issues: [] as unknown[] });
    mockValidate.mockResolvedValue({
      valid: false,
      parseError: null,
      layers: {
        base: layer('Base DMN'),
        business: {
          label: 'Business Rules',
          issues: [
            {
              severity: 'error',
              code: 'BIZ-006',
              message: 'Missing hit policy',
              location: '/definitions/decision[1]',
            },
          ],
        },
        execution: layer('Execution Rules'),
        interaction: layer('Interaction Rules'),
        content: {
          label: 'Content',
          issues: [
            {
              severity: 'warning',
              code: 'CON-001',
              message: 'Untitled input',
              line: 12,
              column: 4,
            },
          ],
        },
      },
      summary: { errors: 1, warnings: 1, infos: 0 },
    });
    const ok = await post('/validate').send({ content: '<definitions/>' });
    expect(ok.status).toBe(200);
    expectToMatchOperation(ok, 'post', '/dmns/validate');

    const bad = await post('/validate').send({ content: 42 });
    expect(bad.status).toBe(400);
    expectToMatchOperation(bad, 'post', '/dmns/validate');

    mockValidate.mockRejectedValue(new Error('validator crashed'));
    const failed = await post('/validate').send({ content: '<definitions/>' });
    expect(failed.status).toBe(500);
    expectToMatchOperation(failed, 'post', '/dmns/validate');
  });

  test('POST /dmns/deploy 400 and 500, as documented', async () => {
    const bad = await post('/deploy').send({ deploymentName: 'Zorgtoeslag' });
    expect(bad.status).toBe(400);
    expectToMatchOperation(bad, 'post', '/dmns/deploy');

    operaton.deployDrd.mockRejectedValue(new Error('Operaton unreachable'));
    const failed = await post('/deploy').send({
      xml: '<definitions/>',
      deploymentName: 'Zorgtoeslag',
    });
    expect(failed.status).toBe(500);
    expectToMatchOperation(failed, 'post', '/dmns/deploy');
  });

  test('POST /dmns/drd/deploy 400 and 500, as documented', async () => {
    const bad = await post('/drd/deploy').send({ dmnIds: ['A'], deploymentName: 'Keten' });
    expect(bad.status).toBe(400);
    expectToMatchOperation(bad, 'post', '/dmns/drd/deploy');

    operaton.assembleDrd.mockRejectedValue(new Error('Operaton unreachable'));
    const failed = await post('/drd/deploy').send({
      dmnIds: ['A', 'B'],
      deploymentName: 'Keten',
    });
    expect(failed.status).toBe(500);
    expectToMatchOperation(failed, 'post', '/dmns/drd/deploy');
  });

  test('POST /dmns/process/deploy 400 and 500, as documented', async () => {
    const bad = await post('/process/deploy').send({
      bpmnXml: '<definitions/>',
      deploymentName: 'Proces',
    });
    expect(bad.status).toBe(400);
    expectToMatchOperation(bad, 'post', '/dmns/process/deploy');

    mockDeployProcess.mockRejectedValue(new Error('Operaton unreachable'));
    const failed = await post('/process/deploy').send({
      bpmnXml: '<bpmn:definitions/>',
      deploymentName: 'Proces',
      organization: 'flevoland',
    });
    expect(failed.status).toBe(500);
    expectToMatchOperation(failed, 'post', '/dmns/process/deploy');
  });

  test('POST /dmns/drd/deploy 200, as documented', async () => {
    operaton.assembleDrd.mockResolvedValue('<definitions/>');
    operaton.deployDrd.mockResolvedValue({ deploymentId: 'dep-1' });

    const res = await post('/drd/deploy').send({
      dmnIds: ['A', 'B', 'Entry'],
      deploymentName: 'ZorgtoeslagDRD',
    });

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'post', '/dmns/drd/deploy');
  });

  test('POST /dmns/process/deploy 200, as documented', async () => {
    mockDeployProcess.mockResolvedValue({ deploymentId: 'dep-1', resourceCount: 5 });
    const forms = [{ id: 'f1', schema: {} }];
    const subProcesses = [{ filename: 'sub.bpmn', xml: '<bpmn/>' }];
    const documents = [{ id: 'd1', template: {} }];

    const res = await post('/process/deploy').send({
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

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'post', '/dmns/process/deploy');
  });

  test('POST /dmns/process/deploy 200 with an unrecorded bundle, as documented', async () => {
    mockDeployProcess.mockResolvedValue({ deploymentId: 'dep-1', resourceCount: 1 });
    mockRecordDeployedBundle.mockRejectedValue(new Error('connection terminated'));

    const res = await post('/process/deploy').send({
      bpmnXml: '<bpmn:definitions><bpmn:process id="P"/></bpmn:definitions>',
      deploymentName: 'P',
      organization: 'flevoland',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.bundleRecorded).toBe(false);
    expectToMatchOperation(res, 'post', '/dmns/process/deploy');
  });

  test('POST /dmns/deploy 200, as documented', async () => {
    operaton.deployDrd.mockResolvedValue({ deploymentId: 'dep-2' });

    const res = await post('/deploy').send({
      xml: '<dmn:definitions/>',
      deploymentName: 'test-dmn',
      filename: 'individuele inkomenstoeslag-iknow-patched.dmn',
    });

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'post', '/dmns/deploy');
  });
});
