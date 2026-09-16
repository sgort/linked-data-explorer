import express from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../services/orchestration.service', () => ({
  __esModule: true,
  orchestrationService: { executeChain: jest.fn() },
}));
jest.mock('../services/sparql.service', () => ({
  __esModule: true,
  sparqlService: { findChainLinks: jest.fn() },
}));

import { orchestrationService } from '../services/orchestration.service';
import { sparqlService } from '../services/sparql.service';
import { errorHandler } from '../middleware/error.middleware';
import { versionMiddleware } from '../middleware/version.middleware';
import { expectToMatchOperation } from '../openapi/testing/conformance';
import chainRoutes from './chain.routes';

const mockExecuteChain = orchestrationService.executeChain as jest.Mock;
const mockFindChainLinks = sparqlService.findChainLinks as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/v1/chains', chainRoutes);
  return app;
}

const OK_RESULT = {
  success: true,
  chainId: 'chain-1',
  executionTime: 42,
  finalOutputs: { toeslag: 1200 },
  steps: [{ dmnId: 'd1' }, { dmnId: 'd2' }],
};

beforeEach(() => {
  mockExecuteChain.mockReset();
  mockFindChainLinks.mockReset();
});

describe('POST /v1/chains/execute', () => {
  test('executes the chain and returns the final outputs', async () => {
    mockExecuteChain.mockResolvedValue(OK_RESULT);

    const res = await request(makeApp())
      .post('/v1/chains/execute')
      .send({ dmnIds: ['d1', 'd2'], inputs: { bsn: '123' } });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({
      success: true,
      chainId: 'chain-1',
      executionTime: 42,
      finalOutputs: { toeslag: 1200 },
    });
    expect(mockExecuteChain).toHaveBeenCalledWith(
      ['d1', 'd2'],
      { bsn: '123' },
      undefined,
      undefined,
      undefined
    );
  });

  test('omits intermediate steps unless the caller asks for them', async () => {
    mockExecuteChain.mockResolvedValue(OK_RESULT);

    const res = await request(makeApp())
      .post('/v1/chains/execute')
      .send({ dmnIds: ['d1'], inputs: { bsn: '123' } });

    expect(res.body.data).not.toHaveProperty('steps');
  });

  test('includes intermediate steps when options.includeIntermediateSteps is set', async () => {
    mockExecuteChain.mockResolvedValue(OK_RESULT);

    const res = await request(makeApp())
      .post('/v1/chains/execute')
      .send({
        dmnIds: ['d1', 'd2'],
        inputs: { bsn: '123' },
        options: { includeIntermediateSteps: true },
      });

    expect(res.body.data.steps).toEqual(OK_RESULT.steps);
  });

  test('forwards the DRD parameters and endpoint override', async () => {
    mockExecuteChain.mockResolvedValue(OK_RESULT);

    await request(makeApp())
      .post('/v1/chains/execute')
      .send({
        dmnIds: ['drd-1'],
        inputs: { bsn: '123' },
        endpoint: 'https://triplydb.example/sparql',
        isDrd: true,
        drdEntryPointId: 'decision_root',
      });

    expect(mockExecuteChain).toHaveBeenCalledWith(
      ['drd-1'],
      { bsn: '123' },
      'https://triplydb.example/sparql',
      true,
      'decision_root'
    );
  });

  test.each([
    [
      'a missing dmnIds array',
      { inputs: { bsn: '1' } },
      'dmnIds array is required and must not be empty',
    ],
    [
      'an empty dmnIds array',
      { dmnIds: [], inputs: { bsn: '1' } },
      'dmnIds array is required and must not be empty',
    ],
    ['missing inputs', { dmnIds: ['d1'] }, 'inputs object is required'],
    ['an empty inputs object', { dmnIds: ['d1'], inputs: {} }, 'inputs object is required'],
  ])('rejects %s with 400 INVALID_REQUEST', async (_label, body, message) => {
    const res = await request(makeApp()).post('/v1/chains/execute').send(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: 'INVALID_REQUEST', message });
    expect(mockExecuteChain).not.toHaveBeenCalled();
  });

  test('a failed-but-completed execution answers 500 and carries the error through', async () => {
    mockExecuteChain.mockResolvedValue({
      success: false,
      chainId: 'chain-1',
      executionTime: 12,
      finalOutputs: {},
      error: 'DMN d2 returned no matching rule',
    });

    const res = await request(makeApp())
      .post('/v1/chains/execute')
      .send({ dmnIds: ['d1', 'd2'], inputs: { bsn: '123' } });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.data.error).toBe('DMN d2 returned no matching rule');
  });

  test('returns 500 with an EXECUTION_ERROR code when the orchestrator throws', async () => {
    mockExecuteChain.mockRejectedValue(new Error('Operaton unreachable'));

    const res = await request(makeApp())
      .post('/v1/chains/execute')
      .send({ dmnIds: ['d1'], inputs: { bsn: '123' } });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: 'EXECUTION_ERROR', message: 'Operaton unreachable' },
    });
  });
});

describe('GET /v1/chains', () => {
  test('groups the pairwise links by source DMN', async () => {
    mockFindChainLinks.mockResolvedValue([
      { from: 'A', to: 'B', variable: 'leeftijd', variableType: 'integer' },
      { from: 'A', to: 'C', variable: 'inkomen', variableType: 'double' },
      { from: 'B', to: 'C', variable: 'recht', variableType: 'boolean' },
    ]);

    const res = await request(makeApp()).get('/v1/chains');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      total: 2,
      chains: [
        {
          from: 'A',
          connections: [
            { to: 'B', variable: 'leeftijd', variableType: 'integer' },
            { to: 'C', variable: 'inkomen', variableType: 'double' },
          ],
        },
        {
          from: 'B',
          connections: [{ to: 'C', variable: 'recht', variableType: 'boolean' }],
        },
      ],
    });
  });

  test('preserves first-seen order of the source DMNs', async () => {
    mockFindChainLinks.mockResolvedValue([
      { from: 'Z', to: 'Y', variable: 'v', variableType: 'string' },
      { from: 'A', to: 'B', variable: 'v', variableType: 'string' },
    ]);

    const res = await request(makeApp()).get('/v1/chains');

    expect(res.body.data.chains.map((c: { from: string }) => c.from)).toEqual(['Z', 'A']);
  });

  test('reports no chains rather than an error when there are no links', async () => {
    mockFindChainLinks.mockResolvedValue([]);

    const res = await request(makeApp()).get('/v1/chains');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ total: 0, chains: [] });
  });

  test('returns 500 with a DISCOVERY_ERROR code when the SPARQL lookup throws', async () => {
    mockFindChainLinks.mockRejectedValue(new Error('SPARQL endpoint unreachable'));

    const res = await request(makeApp()).get('/v1/chains');

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: 'DISCOVERY_ERROR', message: 'SPARQL endpoint unreachable' },
    });
  });
});

describe('/v1/chains matches its OpenAPI description', () => {
  function makeDocumentedApp() {
    const app = express();
    app.use(express.json());
    app.use(versionMiddleware); // app-wide in index.ts
    app.use('/v1/chains', chainRoutes);
    app.use(errorHandler); // app-wide in index.ts; answers malformed JSON bodies
    return app;
  }

  // Populates every ExecutionStep field this schema documents (dmnId, dmnTitle,
  // startTime, endTime, duration, inputs, outputs), each with more than one key
  // and more than one JSON value type, so free-form inputs/outputs are actually
  // exercised rather than left as an empty object.
  const FIRST_STEP = {
    dmnId: 'SVB_LeeftijdsInformatie',
    dmnTitle: 'SVB Leeftijdsinformatie',
    startTime: 1_700_000_000_000,
    endTime: 1_700_000_000_042,
    duration: 42,
    inputs: { bsn: '123456789', geboortedatum: '1990-01-01' },
    outputs: { leeftijd: 35, isVolwassen: true },
  };

  const SECOND_STEP = {
    dmnId: 'SZW_BijstandsnormInformatie',
    dmnTitle: 'SZW Bijstandsnorm',
    startTime: 1_700_000_000_042,
    endTime: 1_700_000_000_090,
    duration: 48,
    inputs: { leeftijd: 35, isVolwassen: true },
    outputs: { bijstandsnorm: 1200, toeslagPercentage: 0.2, opmerking: null },
  };

  test('GET / 200 with populated chains, as documented', async () => {
    mockFindChainLinks.mockResolvedValue([
      { from: 'A', to: 'B', variable: 'leeftijd', variableType: 'integer' },
      { from: 'A', to: 'C', variable: 'inkomen', variableType: 'double' },
    ]);

    const res = await request(makeDocumentedApp()).get('/v1/chains');

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/chains');
  });

  test('GET / 500 DISCOVERY_ERROR, as documented', async () => {
    mockFindChainLinks.mockRejectedValue(new Error('SPARQL endpoint unreachable'));

    const res = await request(makeDocumentedApp()).get('/v1/chains');

    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'get', '/chains');
  });

  test('POST /execute 200 without steps, as documented', async () => {
    mockExecuteChain.mockResolvedValue({
      success: true,
      chainId: 'SVB_LeeftijdsInformatie->SZW_BijstandsnormInformatie',
      executionTime: 90,
      finalOutputs: { bijstandsnorm: 1200, toeslagPercentage: 0.2, isVolwassen: true },
      steps: [FIRST_STEP, SECOND_STEP],
    });

    const res = await request(makeDocumentedApp())
      .post('/v1/chains/execute')
      .send({
        dmnIds: ['SVB_LeeftijdsInformatie', 'SZW_BijstandsnormInformatie'],
        inputs: { bsn: '123' },
      });

    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty('steps');
    expectToMatchOperation(res, 'post', '/chains/execute');
  });

  test('POST /execute 200 with steps, as documented', async () => {
    mockExecuteChain.mockResolvedValue({
      success: true,
      chainId: 'SVB_LeeftijdsInformatie->SZW_BijstandsnormInformatie',
      executionTime: 90,
      finalOutputs: { bijstandsnorm: 1200, toeslagPercentage: 0.2, isVolwassen: true },
      steps: [FIRST_STEP, SECOND_STEP],
    });

    const res = await request(makeDocumentedApp())
      .post('/v1/chains/execute')
      .send({
        dmnIds: ['SVB_LeeftijdsInformatie', 'SZW_BijstandsnormInformatie'],
        inputs: { bsn: '123' },
        options: { includeIntermediateSteps: true },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.steps).toEqual([FIRST_STEP, SECOND_STEP]);
    expectToMatchOperation(res, 'post', '/chains/execute');
  });

  test.each([
    ['a missing dmnIds array', { inputs: { bsn: '1' } }],
    ['a missing inputs object', { dmnIds: ['d1'] }],
  ])('POST /execute 400 for %s, as documented', async (_label, body) => {
    const res = await request(makeDocumentedApp()).post('/v1/chains/execute').send(body);

    expect(res.status).toBe(400);
    expectToMatchOperation(res, 'post', '/chains/execute');
  });

  test('POST /execute 500 when the orchestrator resolves failed, as documented', async () => {
    mockExecuteChain.mockResolvedValue({
      success: false,
      chainId: 'SVB_LeeftijdsInformatie->SZW_BijstandsnormInformatie',
      executionTime: 55,
      finalOutputs: { leeftijd: 35, isVolwassen: true },
      steps: [FIRST_STEP],
      error: 'DMN SZW_BijstandsnormInformatie returned no matching rule',
    });

    const res = await request(makeDocumentedApp())
      .post('/v1/chains/execute')
      .send({
        dmnIds: ['SVB_LeeftijdsInformatie', 'SZW_BijstandsnormInformatie'],
        inputs: { bsn: '123' },
        options: { includeIntermediateSteps: true },
      });

    expect(res.status).toBe(500);
    expect(res.body.data.error).toBe('DMN SZW_BijstandsnormInformatie returned no matching rule');
    expectToMatchOperation(res, 'post', '/chains/execute');
  });

  test('POST /execute 500 EXECUTION_ERROR when the orchestrator throws, as documented', async () => {
    mockExecuteChain.mockRejectedValue(new Error('Operaton unreachable'));

    const res = await request(makeDocumentedApp())
      .post('/v1/chains/execute')
      .send({ dmnIds: ['d1'], inputs: { bsn: '123' } });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('EXECUTION_ERROR');
    expectToMatchOperation(res, 'post', '/chains/execute');
  });

  test('POST /execute 500 INTERNAL_ERROR for a malformed JSON body, as documented (#143)', async () => {
    const res = await request(makeDocumentedApp())
      .post('/v1/chains/execute')
      .set('Content-Type', 'application/json')
      .send('{"dmnIds":');

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expectToMatchOperation(res, 'post', '/chains/execute');
  });
});
