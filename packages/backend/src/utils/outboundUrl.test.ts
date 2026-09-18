import express, { Request, Response } from 'express';
import request from 'supertest';
import { config } from './config';
import {
  checkOperatonTarget,
  checkSparqlEndpoint,
  checkTriplyDbBaseUrl,
  isInternalAddress,
  refuseOptionalEndpoint,
} from './outboundUrl';

const original = { ...config.outbound };
const originalOperaton = config.operaton.baseUrl;
afterEach(() => {
  Object.assign(config.outbound, original);
  config.operaton.baseUrl = originalOperaton;
});

describe('isInternalAddress', () => {
  test.each([
    '127.0.0.1',
    '127.255.0.9',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    'fec0::1',
    '2001:0:4136:e378:8000:63bf:3fff:fdd2', // Teredo
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:a9fe:a9fe',
    '64:ff9b::7f00:1',
    '::7f00:1', // IPv4-compatible (deprecated) form of 127.0.0.1
    '2002:7f00:1::1', // 6to4 form of 127.0.0.1
    '::FFFF:7F00:0001', // uppercase
    '0000:0000:0000:0000:0000:ffff:0a00:0001', // full 8-group, leading zeros
    'fe80::1%eth0', // zone id
    '::ffff:127.0.0.1%eth0', // zone id on an embedded-IPv4 form
    '[::ffff:169.254.169.254]', // bracketed
  ])('%s is internal', (ip) => expect(isInternalAddress(ip)).toBe(true));

  test.each([
    '8.8.8.8',
    '172.32.0.1',
    '100.128.0.1',
    '2a00:1450:4001::1',
    '::ffff:8.8.8.8',
    '64:ff9b::808:808',
    '2002:808:808::1',
    '2001:4860:4860::8888', // Google public DNS, in the 2001:4860::/32 range
  ])('%s is public', (ip) => expect(isInternalAddress(ip)).toBe(false));
});

describe('checkSparqlEndpoint', () => {
  test('accepts a public https URL', () => {
    const c = checkSparqlEndpoint(
      'https://api.open-regels.triply.cc/datasets/a/b/sparql',
      'endpoint'
    );
    expect(c.ok).toBe(true);
  });

  test.each([
    [42, '`endpoint` must be a string'],
    [['a', 'b'], '`endpoint` must be a string'],
    ['not a url', '`endpoint` is not a valid URL'],
    ['ftp://example.org/x', '`endpoint` must use https'],
    ['http://example.org/sparql', '`endpoint` must use https'],
    ['https://user:pw@example.org/sparql', '`endpoint` must not contain credentials'],
    ['https://127.0.0.1/sparql', '`endpoint` points to an internal address'],
    ['https://[::1]/sparql', '`endpoint` points to an internal address'],
    ['https://2130706433/sparql', '`endpoint` points to an internal address'],
    ['https://localhost/sparql', '`endpoint` points to an internal address'],
    ['https://localhost./sparql', '`endpoint` points to an internal address'],
    ['https://foo.localhost./sparql', '`endpoint` points to an internal address'],
  ])('refuses %p', (value, reason) => {
    expect(checkSparqlEndpoint(value, 'endpoint')).toEqual({ ok: false, reason });
  });

  test('ALLOW_LOCAL_ENDPOINTS admits http and local addresses', () => {
    config.outbound.allowLocalEndpoints = true;
    expect(checkSparqlEndpoint('http://localhost:3030/ds/query', 'endpoint').ok).toBe(true);
    expect(checkSparqlEndpoint('http://10.0.0.5/sparql', 'endpoint').ok).toBe(true);
  });

  test('ALLOW_LOCAL_ENDPOINTS still refuses other schemes and credentials', () => {
    config.outbound.allowLocalEndpoints = true;
    expect(checkSparqlEndpoint('file:///etc/passwd', 'endpoint').ok).toBe(false);
    expect(checkSparqlEndpoint('http://u:p@localhost/x', 'endpoint').ok).toBe(false);
  });
});

describe('checkTriplyDbBaseUrl', () => {
  test('accepts an allowed host', () => {
    expect(checkTriplyDbBaseUrl('https://api.open-regels.triply.cc', 'config.baseUrl').ok).toBe(
      true
    );
  });

  test('refuses a host not on the list', () => {
    expect(checkTriplyDbBaseUrl('https://example.org', 'config.baseUrl')).toEqual({
      ok: false,
      reason: '`config.baseUrl` host example.org is not an allowed TriplyDB host',
    });
  });

  test('refuses http even for an allowed host, and even with ALLOW_LOCAL_ENDPOINTS', () => {
    config.outbound.allowLocalEndpoints = true;
    expect(checkTriplyDbBaseUrl('http://api.open-regels.triply.cc', 'config.baseUrl')).toEqual({
      ok: false,
      reason: '`config.baseUrl` must use https',
    });
  });

  test('ALLOW_LOCAL_ENDPOINTS does not widen the list', () => {
    config.outbound.allowLocalEndpoints = true;
    expect(checkTriplyDbBaseUrl('https://localhost', 'config.baseUrl').ok).toBe(false);
  });
});

describe('checkOperatonTarget', () => {
  beforeEach(() => {
    config.operaton.baseUrl = 'https://operaton.open-regels.nl/engine-rest';
  });

  test('accepts the configured URL, ignoring a trailing slash', () => {
    expect(
      checkOperatonTarget('https://operaton.open-regels.nl/engine-rest/', 'operatonUrl').ok
    ).toBe(true);
  });

  test('refuses any other URL, naming the configured one', () => {
    expect(checkOperatonTarget('https://evil.example/engine-rest', 'operatonUrl')).toEqual({
      ok: false,
      reason:
        '`operatonUrl` must be omitted or equal the configured Operaton, https://operaton.open-regels.nl/engine-rest',
    });
  });

  test('a mixed-case host or explicit default port in the configured value does not refuse itself', () => {
    config.operaton.baseUrl = 'https://Operaton.Open-Regels.nl:443/engine-rest';
    expect(
      checkOperatonTarget('https://operaton.open-regels.nl/engine-rest', 'operatonUrl').ok
    ).toBe(true);
  });
});

describe('refuseOptionalEndpoint', () => {
  function app() {
    const a = express();
    a.get('/x', (req: Request, res: Response) => {
      if (refuseOptionalEndpoint(res, req, req.query.endpoint, 'endpoint')) return;
      res.json({ passed: true });
    });
    return a;
  }

  test('an absent or empty endpoint passes', async () => {
    expect((await request(app()).get('/x')).body).toEqual({ passed: true });
    expect((await request(app()).get('/x?endpoint=')).body).toEqual({ passed: true });
  });

  test('a refused endpoint answers 400 problem details', async () => {
    const res = await request(app()).get('/x?endpoint=http://169.254.169.254/');
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body).toMatchObject({
      status: 400,
      code: 'INVALID_INPUT',
      detail: '`endpoint` must use https',
    });
  });
});
