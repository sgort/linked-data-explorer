jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => ({
      interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    })),
  },
}));

import { OperatonService } from './operaton.service';

describe('deployProcess', () => {
  test('sends tenant-id in the deployment FormData when organization is provided', async () => {
    const service = new OperatonService();
    const mockPost = jest.fn().mockResolvedValue({ data: { id: 'deployment-1' } });
    (service as unknown as { client: { post: jest.Mock } }).client = { post: mockPost };

    await service.deployProcess(
      '<bpmn:definitions/>',
      'RipR21Process',
      [],
      [],
      [],
      undefined,
      undefined,
      undefined,
      'infra-board',
      'flevoland'
    );

    expect(mockPost).toHaveBeenCalledTimes(1);
    const formData = mockPost.mock.calls[0][1];
    const body = formData.getBuffer().toString('utf-8');
    expect(body).toContain('name="tenant-id"');
    expect(body).toContain('flevoland');
    expect(body).toContain('name="deployment-name"');
  });

  test('omits tenant-id from the FormData when organization is not provided', async () => {
    const service = new OperatonService();
    const mockPost = jest.fn().mockResolvedValue({ data: { id: 'deployment-1' } });
    (service as unknown as { client: { post: jest.Mock } }).client = { post: mockPost };

    await service.deployProcess(
      '<bpmn:definitions/>',
      'RipR21Process',
      [],
      [],
      [],
      undefined,
      undefined,
      undefined,
      'infra-board'
    );

    const formData = mockPost.mock.calls[0][1];
    const body = formData.getBuffer().toString('utf-8');
    expect(body).not.toContain('name="tenant-id"');
  });
});
