import dns from 'node:dns';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { config } from './config';
import {
  assertOutboundUrl,
  createOutboundClient,
  guardRedirect,
  guardedLookup,
  OutboundRefusedError,
} from './outboundHttp';

const original = { ...config.outbound };
afterEach(() => {
  Object.assign(config.outbound, original);
  jest.restoreAllMocks();
});

function stubDns(addresses: { address: string; family: number }[]) {
  jest
    .spyOn(dns, 'lookup')
    .mockImplementation(((
      _host: string,
      _opts: unknown,
      cb: (err: null, a: typeof addresses) => void
    ) => cb(null, addresses)) as unknown as typeof dns.lookup);
}

function lookup(host: string, opts: Record<string, unknown>) {
  return new Promise<{ err: Error | null; address?: unknown; family?: number }>((resolve) =>
    guardedLookup(host, opts, (err, address, family) => resolve({ err, address, family }))
  );
}

describe('guardedLookup', () => {
  test('passes a public address through, in the shape asked for', async () => {
    stubDns([{ address: '93.184.216.34', family: 4 }]);
    expect(await lookup('example.org', {})).toEqual({
      err: null,
      address: '93.184.216.34',
      family: 4,
    });
    expect((await lookup('example.org', { all: true })).address).toEqual([
      { address: '93.184.216.34', family: 4 },
    ]);
  });

  test.each(['127.0.0.1', '10.0.0.1', '169.254.169.254', '::1', 'fd00::1'])(
    'refuses a name resolving to %s',
    async (ip) => {
      stubDns([{ address: ip, family: ip.includes(':') ? 6 : 4 }]);
      const { err } = await lookup('rebind.example', {});
      expect(err).toBeInstanceOf(OutboundRefusedError);
      expect(err?.message).toBe('rebind.example resolves to an internal address');
    }
  );

  test('refuses when any one of several addresses is internal', async () => {
    stubDns([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ]);
    expect((await lookup('mixed.example', { all: true })).err).toBeInstanceOf(OutboundRefusedError);
  });

  test('ALLOW_LOCAL_ENDPOINTS admits internal addresses', async () => {
    config.outbound.allowLocalEndpoints = true;
    stubDns([{ address: '127.0.0.1', family: 4 }]);
    expect((await lookup('localhost', {})).err).toBeNull();
  });
});

describe('guardRedirect and assertOutboundUrl', () => {
  test('refuse a redirect to http or to an internal IP literal', () => {
    expect(() => guardRedirect({ protocol: 'http:', hostname: 'example.org' })).toThrow(
      OutboundRefusedError
    );
    expect(() => guardRedirect({ protocol: 'https:', hostname: '169.254.169.254' })).toThrow(
      OutboundRefusedError
    );
    expect(() => guardRedirect({ protocol: 'https:', hostname: 'example.org' })).not.toThrow();
  });

  test('assertOutboundUrl refuses internal literals unless local endpoints are allowed', () => {
    expect(() => assertOutboundUrl('https://127.0.0.1/x')).toThrow(OutboundRefusedError);
    config.outbound.allowLocalEndpoints = true;
    expect(() => assertOutboundUrl('http://127.0.0.1/x')).not.toThrow();
  });
});

describe('createOutboundClient', () => {
  let server: http.Server;
  let port: number;
  beforeAll(async () => {
    server = http.createServer((_req, res) => res.end('ok'));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  test('refuses a local server by default, before connecting', async () => {
    await expect(createOutboundClient().get(`http://127.0.0.1:${port}/`)).rejects.toThrow(
      OutboundRefusedError
    );
  });

  test('refuses a name that resolves to loopback', async () => {
    config.outbound.allowLocalEndpoints = false;
    stubDns([{ address: '127.0.0.1', family: 4 }]);
    // https: so the interceptor's scheme check passes and the agent's lookup is what refuses.
    await expect(createOutboundClient().get(`https://rebind.example:${port}/`)).rejects.toThrow(
      'rebind.example resolves to an internal address'
    );
  });

  test('reaches a local server when local endpoints are allowed', async () => {
    config.outbound.allowLocalEndpoints = true;
    const res = await createOutboundClient().get(`http://127.0.0.1:${port}/`);
    expect(res.data).toBe('ok');
  });
});
