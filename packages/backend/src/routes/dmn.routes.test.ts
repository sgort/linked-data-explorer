import express from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../services/operaton.service', () => ({
  operatonService: { deployProcess: jest.fn() },
}));
jest.mock('../services/assets.service', () => ({
  writeDeployedBundleToRepo: jest.fn(),
}));

import { operatonService } from '../services/operaton.service';
import { writeDeployedBundleToRepo } from '../services/assets.service';
import dmnRoutes from './dmn.routes';

const mockDeployProcess = operatonService.deployProcess as jest.Mock;
const mockWriteBundle = writeDeployedBundleToRepo as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/dmns', dmnRoutes);
  return app;
}

beforeEach(() => {
  mockDeployProcess.mockReset();
  mockWriteBundle.mockReset();
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

  test('passes organization through to deployProcess and includes repoSync on success', async () => {
    mockDeployProcess.mockResolvedValue({ deploymentId: 'dep-1', resourceCount: 3 });
    mockWriteBundle.mockResolvedValue({
      written: true,
      path: '/repo/deployed/flevoland/RipR21Process',
    });

    const res = await request(makeApp()).post('/api/dmns/process/deploy').send({
      bpmnXml: '<bpmn:definitions/>',
      deploymentName: 'RipR21Process',
      organization: 'flevoland',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.repoSync).toEqual({
      written: true,
      path: '/repo/deployed/flevoland/RipR21Process',
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
    expect(mockWriteBundle).toHaveBeenCalledWith({
      organization: 'flevoland',
      definitionKey: 'RipR21Process',
      bpmnXml: '<bpmn:definitions/>',
      subProcesses: [],
      forms: [],
      documents: [],
    });
  });

  test('a failed repo-sync write does not fail the deploy response', async () => {
    mockDeployProcess.mockResolvedValue({ deploymentId: 'dep-1', resourceCount: 1 });
    mockWriteBundle.mockResolvedValue({
      written: false,
      path: '/repo/deployed/flevoland/RipR21Process',
      error: 'EACCES',
    });

    const res = await request(makeApp()).post('/api/dmns/process/deploy').send({
      bpmnXml: '<bpmn:definitions/>',
      deploymentName: 'RipR21Process',
      organization: 'flevoland',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.repoSync).toEqual({
      written: false,
      path: '/repo/deployed/flevoland/RipR21Process',
      error: 'EACCES',
    });
  });
});
