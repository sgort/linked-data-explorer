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
