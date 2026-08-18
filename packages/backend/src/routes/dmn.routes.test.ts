import express from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../services/operaton.service', () => ({
  operatonService: { deployProcess: jest.fn(), deployDrd: jest.fn(), evaluateRaw: jest.fn() },
}));

import { operatonService } from '../services/operaton.service';
import dmnRoutes from './dmn.routes';

const mockDeployProcess = operatonService.deployProcess as jest.Mock;
const mockDeployDrd = operatonService.deployDrd as jest.Mock;
const mockEvaluateRaw = operatonService.evaluateRaw as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/dmns', dmnRoutes);
  return app;
}

beforeEach(() => {
  mockDeployProcess.mockReset();
  mockDeployDrd.mockReset();
  mockEvaluateRaw.mockReset();
});

describe('POST /api/dmns/evaluate/:decisionKey', () => {
  test('passes the decision key and variables through, returning Operaton’s raw result array', async () => {
    mockEvaluateRaw.mockResolvedValue([{ aanspraak: { value: true, type: 'Boolean' } }]);

    const res = await request(makeApp())
      .post('/api/dmns/evaluate/_bca439b7-fdb8-40e3-8a1d-3bb95571c65c')
      .send({ variables: { woonachtig: { value: true, type: 'Boolean' } } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ aanspraak: { value: true, type: 'Boolean' } }]);
    expect(mockEvaluateRaw).toHaveBeenCalledWith('_bca439b7-fdb8-40e3-8a1d-3bb95571c65c', {
      woonachtig: { value: true, type: 'Boolean' },
    });
  });

  test('treats a missing variables object as an empty one rather than failing', async () => {
    mockEvaluateRaw.mockResolvedValue([]);

    const res = await request(makeApp()).post('/api/dmns/evaluate/some-key').send({});

    expect(res.status).toBe(200);
    expect(mockEvaluateRaw).toHaveBeenCalledWith('some-key', {});
  });

  test('forwards an Operaton exception body and status verbatim (e.g. a RestException)', async () => {
    const axiosError = Object.assign(new Error('Request failed with status code 500'), {
      isAxiosError: true,
      response: {
        status: 500,
        data: { type: 'RestException', message: 'Unknown property used in expression' },
      },
    });
    mockEvaluateRaw.mockRejectedValue(axiosError);

    const res = await request(makeApp())
      .post('/api/dmns/evaluate/bad-key')
      .send({ variables: {} });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      type: 'RestException',
      message: 'Unknown property used in expression',
    });
  });

  test('falls back to a ProxyError shape for a non-axios failure', async () => {
    mockEvaluateRaw.mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await request(makeApp())
      .post('/api/dmns/evaluate/some-key')
      .send({ variables: {} });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ type: 'ProxyError', message: 'ECONNREFUSED' });
  });
});

describe('POST /api/dmns/deploy', () => {
  test('returns 400 when xml is missing', async () => {
    const res = await request(makeApp())
      .post('/api/dmns/deploy')
      .send({ deploymentName: 'test-dmn' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
    expect(mockDeployDrd).not.toHaveBeenCalled();
  });

  test('returns 400 when deploymentName is missing', async () => {
    const res = await request(makeApp())
      .post('/api/dmns/deploy')
      .send({ xml: '<dmn:definitions/>' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
    expect(mockDeployDrd).not.toHaveBeenCalled();
  });

  test('deploys raw XML as-is, deriving the filename from deploymentName when none is given', async () => {
    mockDeployDrd.mockResolvedValue({ deploymentId: 'dep-1' });

    const res = await request(makeApp())
      .post('/api/dmns/deploy')
      .send({ xml: '<dmn:definitions/>', deploymentName: 'individuele-inkomenstoeslag' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ deploymentId: 'dep-1' });
    expect(mockDeployDrd).toHaveBeenCalledWith(
      '<dmn:definitions/>',
      'individuele-inkomenstoeslag',
      'individuele-inkomenstoeslag.dmn'
    );
  });

  test('uses an explicit filename when given', async () => {
    mockDeployDrd.mockResolvedValue({ deploymentId: 'dep-2' });

    const res = await request(makeApp()).post('/api/dmns/deploy').send({
      xml: '<dmn:definitions/>',
      deploymentName: 'test-dmn',
      filename: 'individuele inkomenstoeslag-iknow-patched.dmn',
    });

    expect(res.status).toBe(200);
    expect(mockDeployDrd).toHaveBeenCalledWith(
      '<dmn:definitions/>',
      'test-dmn',
      'individuele inkomenstoeslag-iknow-patched.dmn'
    );
  });

  test('returns 500 with the engine error message when deployDrd rejects', async () => {
    mockDeployDrd.mockRejectedValue(new Error('Operaton unreachable'));

    const res = await request(makeApp())
      .post('/api/dmns/deploy')
      .send({ xml: '<dmn:definitions/>', deploymentName: 'test-dmn' });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('DMN_DEPLOY_FAILED');
    expect(res.body.error.message).toBe('Operaton unreachable');
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
});
