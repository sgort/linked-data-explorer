import express from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../services/operaton.service', () => ({
  operatonService: { deployProcess: jest.fn(), deployDrd: jest.fn() },
}));

import { operatonService } from '../services/operaton.service';
import dmnRoutes from './dmn.routes';

const mockDeployProcess = operatonService.deployProcess as jest.Mock;
const mockDeployDrd = operatonService.deployDrd as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/dmns', dmnRoutes);
  return app;
}

beforeEach(() => {
  mockDeployProcess.mockReset();
  mockDeployDrd.mockReset();
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
