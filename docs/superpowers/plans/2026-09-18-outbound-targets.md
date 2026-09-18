# Outbound Targets Implementation Plan (#142)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The backend refuses to call internal or unapproved hosts on a caller's behalf, stops taking the Operaton deploy target from the caller, and moves the TriplyDB assets token out of the query string.

**Architecture:** Two layers. A synchronous route check (`src/utils/outboundUrl.ts`) parses caller-supplied URLs and answers 400 problem details before any request. A connect-time guard (`src/utils/outboundHttp.ts`) gives every client that reaches a caller-supplied host an axios instance whose agents refuse internal addresses after DNS resolution, whose request interceptor refuses internal IP literals, and whose redirects are re-checked.

**Tech Stack:** Express 4, TypeScript, axios 1.20, Node `net.BlockList`/`dns`, Jest + supertest (backend), React + Vitest (frontend), Spectral.

**Spec:** `docs/superpowers/specs/2026-09-18-outbound-targets-design.md`

## Global Constraints

- New settings: `TRIPLYDB_ALLOWED_HOSTS` (comma-separated, default `api.open-regels.triply.cc`) and `ALLOW_LOCAL_ENDPOINTS` (`true` enables; default off). ACC and PROD need no change.
- Refusals answer **400**, `code: 'INVALID_INPUT'`, through the existing `sendProblem(res, req, { status, code, detail })` in `src/utils/problem.ts`, before any outbound request.
- `ALLOW_LOCAL_ENDPOINTS` admits `http:` and internal addresses for SPARQL endpoints. It never widens `TRIPLYDB_ALLOWED_HOSTS`, and TriplyDB-with-token targets stay `https:`-only.
- Configured hosts (Operaton client, DSO, the default TriplyDB client, the hardcoded assets host) are not guarded.
- Two corrections to the spec, found while tracing: `triplydb.service.ts` has **five** `fetch` calls, not three; all five move. The template routes and `DELETE /cache/clear` take an `endpoint` but never request it (`template.service.ts:115-142` ignores it; the cache uses it as a map key), so they are **not** validated and keep their lint exceptions. Task 8 records both in the spec.
- Backend commands run from `packages/backend`: tests `npx jest --config jest.config.js --coverage=false <path>` (never bare `npx jest` from the repo root, which ignores this config); `npm run typecheck`; `npm run lint`; `npm run check-format`; `npm run lint:openapi`. Frontend from `packages/frontend`: `npx vitest run <path>`, `npm run typecheck`, `npm run lint`.
- No Claude attribution anywhere. Never bypass hooks. Never start, stop or restart dev servers. Commits are made by the controller after review.

---

### Task 1: Settings and the route-level checks

**Files:**

- Modify: `packages/backend/src/utils/config.ts` (add an `outbound` block after `operaton`, ~line 73)
- Modify: `packages/backend/.env.example` (document both settings next to the TriplyDB/Operaton block, ~line 55-60)
- Create: `packages/backend/src/utils/outboundUrl.ts`
- Test: `packages/backend/src/utils/outboundUrl.test.ts`

**Interfaces:**

- Produces:
  - `config.outbound: { allowLocalEndpoints: boolean; triplydbAllowedHosts: string[] }`
  - `type OutboundCheck = { ok: true; url: URL } | { ok: false; reason: string }`
  - `isInternalAddress(ip: string): boolean`
  - `checkSparqlEndpoint(value: unknown, field: string): OutboundCheck`
  - `checkTriplyDbBaseUrl(value: unknown, field: string): OutboundCheck`
  - `checkOperatonTarget(value: unknown, field: string): OutboundCheck`
  - `refuseTarget(res: Response, req: Request, check: OutboundCheck): boolean` — sends the 400 and returns `true` when refused
  - `refuseOptionalEndpoint(res: Response, req: Request, value: unknown, field: string): boolean` — `undefined` or `''` passes (the route falls back to the configured endpoint, as today)

- [ ] **Step 1: Add the settings to `config.ts`**

```ts
  outbound: {
    /** Admit http: and internal addresses for SPARQL endpoints. Local development only. */
    allowLocalEndpoints: process.env.ALLOW_LOCAL_ENDPOINTS === 'true',
    /** Hosts a TriplyDB call carrying a caller's token may go to. */
    triplydbAllowedHosts: (process.env.TRIPLYDB_ALLOWED_HOSTS || 'api.open-regels.triply.cc')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  },
```

And in `.env.example`:

```
# Hosts a TriplyDB call carrying a caller's API token may reach (#142).
# Comma-separated. Default: api.open-regels.triply.cc
# TRIPLYDB_ALLOWED_HOSTS=api.open-regels.triply.cc

# Let SPARQL endpoints use http: and local/private addresses, e.g. a local
# Jena on http://localhost:3030 (#142). Local development only: leave unset
# on ACC and PROD.
ALLOW_LOCAL_ENDPOINTS=true
```

- [ ] **Step 2: Write the failing tests** — `outboundUrl.test.ts`

```ts
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
    '127.0.0.1', '127.255.0.9', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1',
    '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255',
    '::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', '64:ff9b::7f00:1',
  ])('%s is internal', (ip) => expect(isInternalAddress(ip)).toBe(true));

  test.each(['8.8.8.8', '172.32.0.1', '100.128.0.1', '2a00:1450:4001::1'])(
    '%s is public',
    (ip) => expect(isInternalAddress(ip)).toBe(false)
  );
});

describe('checkSparqlEndpoint', () => {
  test('accepts a public https URL', () => {
    const c = checkSparqlEndpoint('https://api.open-regels.triply.cc/datasets/a/b/sparql', 'endpoint');
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
    expect(checkTriplyDbBaseUrl('https://api.open-regels.triply.cc', 'config.baseUrl').ok).toBe(true);
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
    expect(checkOperatonTarget('https://operaton.open-regels.nl/engine-rest/', 'operatonUrl').ok).toBe(true);
  });

  test('refuses any other URL, naming the configured one', () => {
    expect(checkOperatonTarget('https://evil.example/engine-rest', 'operatonUrl')).toEqual({
      ok: false,
      reason:
        '`operatonUrl` must be omitted or equal the configured Operaton, https://operaton.open-regels.nl/engine-rest',
    });
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
    expect(res.body).toMatchObject({ status: 400, code: 'INVALID_INPUT', detail: '`endpoint` must use https' });
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx jest --config jest.config.js --coverage=false src/utils/outboundUrl.test.ts`
Expected: FAIL, `Cannot find module './outboundUrl'`.

- [ ] **Step 4: Implement `outboundUrl.ts`**

```ts
/**
 * Route-level checks for URLs a caller asks the backend to request (#142).
 *
 * These run before any outbound request, so a refused target gets a clear 400.
 * They cannot see what a hostname resolves to; outboundHttp.ts refuses internal
 * addresses again at connect time, after DNS resolution.
 */
import { BlockList, isIP } from 'node:net';
import type { Request, Response } from 'express';
import { config } from './config';
import { sendProblem } from './problem';

export type OutboundCheck = { ok: true; url: URL } | { ok: false; reason: string };

const internal = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.168.0.0', 16], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) {
  internal.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 128], ['::1', 128], ['::ffff:0:0', 96], ['64:ff9b::', 96], ['fc00::', 7],
  ['fe80::', 10], ['ff00::', 8],
] as const) {
  internal.addSubnet(net, prefix, 'ipv6');
}

/** Loopback, private, link-local/metadata, CGNAT, multicast, reserved, and IPv4 embedded in IPv6. */
export function isInternalAddress(ip: string): boolean {
  const bare = ip.replace(/^\[|\]$/g, '');
  const family = isIP(bare);
  if (family === 4) return internal.check(bare, 'ipv4');
  if (family === 6) return internal.check(bare, 'ipv6');
  return false;
}

function parse(value: unknown, field: string): OutboundCheck {
  if (typeof value !== 'string') return { ok: false, reason: `\`${field}\` must be a string` };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: `\`${field}\` is not a valid URL` };
  }
  if (url.username || url.password) {
    return { ok: false, reason: `\`${field}\` must not contain credentials` };
  }
  return { ok: true, url };
}

/** `localhost` and its subdomains resolve to loopback by definition (RFC 6761). */
function isInternalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'localhost' || host.endsWith('.localhost') || isInternalAddress(host);
}

export function checkSparqlEndpoint(value: unknown, field: string): OutboundCheck {
  const parsed = parse(value, field);
  if (!parsed.ok) return parsed;
  const { url } = parsed;
  const local = config.outbound.allowLocalEndpoints;
  const schemes = local ? ['https:', 'http:'] : ['https:'];
  if (!schemes.includes(url.protocol)) return { ok: false, reason: `\`${field}\` must use https` };
  if (!local && isInternalHost(url.hostname)) {
    return { ok: false, reason: `\`${field}\` points to an internal address` };
  }
  return parsed;
}

export function checkTriplyDbBaseUrl(value: unknown, field: string): OutboundCheck {
  const parsed = parse(value, field);
  if (!parsed.ok) return parsed;
  const { url } = parsed;
  if (url.protocol !== 'https:') return { ok: false, reason: `\`${field}\` must use https` };
  if (!config.outbound.triplydbAllowedHosts.includes(url.hostname.toLowerCase())) {
    return {
      ok: false,
      reason: `\`${field}\` host ${url.hostname} is not an allowed TriplyDB host`,
    };
  }
  return parsed;
}

const withoutTrailingSlash = (s: string) => s.replace(/\/+$/, '');

export function checkOperatonTarget(value: unknown, field: string): OutboundCheck {
  const parsed = parse(value, field);
  if (!parsed.ok) return parsed;
  const configured = withoutTrailingSlash(config.operaton.baseUrl);
  if (withoutTrailingSlash(parsed.url.href) !== configured) {
    return {
      ok: false,
      reason: `\`${field}\` must be omitted or equal the configured Operaton, ${configured}`,
    };
  }
  return parsed;
}

export function refuseTarget(res: Response, req: Request, check: OutboundCheck): boolean {
  if (check.ok) return false;
  sendProblem(res, req, { status: 400, code: 'INVALID_INPUT', detail: check.reason });
  return true;
}

export function refuseOptionalEndpoint(
  res: Response,
  req: Request,
  value: unknown,
  field: string
): boolean {
  if (value === undefined || value === '') return false;
  return refuseTarget(res, req, checkSparqlEndpoint(value, field));
}
```

Note on `withoutTrailingSlash(parsed.url.href)`: `new URL(...)` lowercases the host and normalises the path, so compare against the configured value passed through `new URL` too if the test for a mixed-case configured URL fails; the configured values in use are lowercase.

- [ ] **Step 5: Run to verify it passes**

Run: `npx jest --config jest.config.js --coverage=false src/utils/outboundUrl.test.ts`
Expected: PASS. If `::ffff:7f00:1` or `64:ff9b::7f00:1` reports public, `BlockList` is not matching the mapped range on this Node version: fall back to decoding the last 32 bits into dotted IPv4 and checking that against the ipv4 rules, and keep the test.

- [ ] **Step 6: Typecheck, lint, format** — `npm run typecheck && npm run lint && npm run check-format`. Stage the four files.

---

### Task 2: The connect-time guard

**Files:**

- Create: `packages/backend/src/utils/outboundHttp.ts`
- Test: `packages/backend/src/utils/outboundHttp.test.ts`

**Interfaces:**

- Consumes: `isInternalAddress`, `config.outbound.allowLocalEndpoints` (Task 1).
- Produces:
  - `guardedLookup` — a `net.LookupFunction`-compatible function
  - `guardRedirect(options: { protocol?: string; hostname?: string }): void` — throws when refused
  - `assertOutboundUrl(url: string): void` — throws when refused
  - `createOutboundClient(defaults?: CreateAxiosDefaults): AxiosInstance`
  - Refusals throw `OutboundRefusedError` (`code = 'EOUTBOUNDREFUSED'`)

- [ ] **Step 1: Write the failing tests** — `outboundHttp.test.ts`

```ts
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
  jest.spyOn(dns, 'lookup').mockImplementation(((
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
    expect(await lookup('example.org', {})).toEqual({ err: null, address: '93.184.216.34', family: 4 });
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
    expect(() => guardRedirect({ protocol: 'http:', hostname: 'example.org' })).toThrow(OutboundRefusedError);
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
```

- [ ] **Step 2: Run to verify it fails** — `npx jest --config jest.config.js --coverage=false src/utils/outboundHttp.test.ts`; expected FAIL, module not found.

- [ ] **Step 3: Implement `outboundHttp.ts`**

```ts
/**
 * HTTP clients for hosts a caller chose (#142).
 *
 * The route checks in outboundUrl.ts see only the URL. This module refuses an
 * internal address where it is actually decided: after DNS resolution (so a
 * public-looking name that resolves inward, or whose answer changes between
 * check and request, is caught), on every redirect, and on IP literals, which
 * Node connects to without a lookup at all.
 */
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import axios, { AxiosInstance, CreateAxiosDefaults } from 'axios';
import { config } from './config';
import { isInternalAddress } from './outboundUrl';

export class OutboundRefusedError extends Error {
  readonly code = 'EOUTBOUNDREFUSED';
  constructor(message: string) {
    super(message);
    this.name = 'OutboundRefusedError';
  }
}

const allowLocal = () => config.outbound.allowLocalEndpoints;

export const guardedLookup = ((hostname: string, options: dns.LookupOptions, callback: Function) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = addresses as dns.LookupAddress[];
    if (!allowLocal() && list.some((a) => isInternalAddress(a.address))) {
      return callback(new OutboundRefusedError(`${hostname} resolves to an internal address`));
    }
    if (options.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}) as unknown as LookupFunction;

function refuse(protocol: string, hostname: string): string | null {
  const schemes = allowLocal() ? ['https:', 'http:'] : ['https:'];
  if (!schemes.includes(protocol)) return `${protocol}//${hostname} must use https`;
  if (!allowLocal() && isInternalAddress(hostname)) return `${hostname} is an internal address`;
  return null;
}

export function assertOutboundUrl(url: string): void {
  const { protocol, hostname } = new URL(url);
  const reason = refuse(protocol, hostname);
  if (reason) throw new OutboundRefusedError(reason);
}

export function guardRedirect(options: { protocol?: string; hostname?: string }): void {
  const reason = refuse(options.protocol ?? '', options.hostname ?? '');
  if (reason) throw new OutboundRefusedError(`Redirect refused: ${reason}`);
}

const httpAgent = new http.Agent({ lookup: guardedLookup });
const httpsAgent = new https.Agent({ lookup: guardedLookup });

export function createOutboundClient(defaults: CreateAxiosDefaults = {}): AxiosInstance {
  const client = axios.create({
    ...defaults,
    httpAgent,
    httpsAgent,
    maxRedirects: 5,
    beforeRedirect: (options) => guardRedirect(options as { protocol?: string; hostname?: string }),
  });
  client.interceptors.request.use((request) => {
    assertOutboundUrl(client.getUri(request));
    return request;
  });
  return client;
}
```

If TypeScript rejects `Function` in the lookup signature under the repo's ESLint rules (`@typescript-eslint/no-unsafe-function-type`), type the callback as `(err: Error | null, address?: string | dns.LookupAddress[], family?: number) => void`.

- [ ] **Step 4: Run to verify it passes** — same command; expected PASS. If the "resolves to loopback" test is refused by the interceptor rather than the lookup (the message would say so), the interceptor is checking too much: it must only refuse IP literals and schemes, never resolve names.

- [ ] **Step 5: Typecheck, lint, format; stage both files.**

---

### Task 3: Route the caller-chosen requests through the guard

**Files:**

- Modify: `packages/backend/src/services/sparql.service.ts:88-118` (`executeQuery`, custom-endpoint branch)
- Modify: `packages/backend/src/services/triplydb.service.ts` (all five `fetch` calls: lines 44, 97, 145, 233, 308)
- Modify tests: `packages/backend/src/services/triplydb.service.test.ts`, `packages/backend/src/services/sparql.service.test.ts`

**Interfaces:**

- Consumes: `createOutboundClient` (Task 2).
- Produces: no signature changes. `triplydbService.executeQuery / constructGraph / listGraphs / updateService / testConnection` keep their signatures and error messages.

- [ ] **Step 1: `sparql.service.ts`** — the custom-endpoint client becomes a guarded one; the default client (configured endpoint) stays plain axios:

```ts
      const client = endpoint
        ? createOutboundClient({
            baseURL: endpoint,
            timeout: config.triplydb.timeout,
            headers: { Accept: 'application/sparql-results+json' },
          })
        : this.client;
```

Add `import { createOutboundClient } from '../utils/outboundHttp';`. Update the comment above it to say the per-call client is also the guarded one (#142).

- [ ] **Step 2: `triplydb.service.ts`** — one module-level client and one helper that reproduces the `fetch` semantics the code relies on (`ok`, `status`, `statusText`, body as text):

```ts
import { config } from '../utils/config';
import { createOutboundClient } from '../utils/outboundHttp';

// Every call here goes to a host the caller chose, so all of them use the
// guarded client (#142). Status handling stays with the callers below.
const client = createOutboundClient({ timeout: config.triplydb.timeout });

async function send(
  url: string,
  init: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: string }
): Promise<{ ok: boolean; status: number; statusText: string; text: string }> {
  const response = await client.request<string>({
    url,
    method: init.method,
    headers: init.headers,
    data: init.body,
    responseType: 'text',
    transformResponse: [(data) => data],
    validateStatus: () => true,
  });
  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    statusText: response.statusText,
    text: typeof response.data === 'string' ? response.data : '',
  };
}
```

Then each call site changes mechanically: `const response = await fetch(url, { method, headers, body })` → `const response = await send(url, { method, headers, body })`; `await response.text()` → `response.text`; `(await response.json()) as T` → `JSON.parse(response.text) as T`. Keep every log line and thrown message as it is. Update the file header comment (it says it uses native fetch).

- [ ] **Step 3: Rewrite the service test's HTTP mock.** `triplydb.service.test.ts` currently replaces `global.fetch`. Replace that with a mock of the guarded client, keeping every existing test case and expectation about behaviour:

```ts
const mockRequest = jest.fn();
jest.mock('../utils/outboundHttp', () => ({
  createOutboundClient: () => ({ request: (...args: unknown[]) => mockRequest(...args) }),
}));

function reply(status: number, body: unknown = '', statusText = '') {
  return { status, statusText, data: typeof body === 'string' ? body : JSON.stringify(body) };
}
```

Replace `mockFetch.mockResolvedValue(response({ json: body }))` with `mockRequest.mockResolvedValue(reply(200, body))`, and assertions on `mockFetch` call arguments with assertions on `mockRequest`, e.g.:

```ts
expect(mockRequest).toHaveBeenCalledWith(
  expect.objectContaining({
    url: 'https://triplydb.example/sparql',
    method: 'POST',
    data: 'SELECT * WHERE { ?s ?p ?o }',
    headers: { 'Content-Type': 'application/sparql-query', Accept: 'application/sparql-results+json' },
  })
);
```

A network failure (`mockFetch.mockRejectedValue(new Error('ENOTFOUND'))`) becomes `mockRequest.mockRejectedValue(new Error('ENOTFOUND'))`. Add one test: a refusal from the guard (`mockRequest.mockRejectedValue(Object.assign(new Error('x.example resolves to an internal address'), { code: 'EOUTBOUNDREFUSED' }))`) surfaces from `executeQuery` as `Failed to execute query: x.example resolves to an internal address`, and from `testConnection` as `false`.

- [ ] **Step 4: `sparql.service.test.ts`** — find how it mocks the custom-endpoint `axios.create` path (`grep -n "axios" src/services/sparql.service.test.ts`). Add `jest.mock('../utils/outboundHttp', () => ({ createOutboundClient: jest.fn() }))` and move every expectation that a custom endpoint creates a client with `baseURL: endpoint` onto `createOutboundClient`. Add one test that the configured endpoint (no `endpoint` argument) does **not** call `createOutboundClient`.

- [ ] **Step 5: Run** `npx jest --config jest.config.js --coverage=false src/services` — expected all PASS. Then run the full backend suite once with the same command minus the path, and report the count.

- [ ] **Step 6: Typecheck, lint, format; stage.**

---

### Task 4: 400 for refused SPARQL endpoints on every route that requests one

**Files:**

- Modify: `packages/backend/src/routes/norms.routes.ts:85`
- Modify: `packages/backend/src/routes/dmn.routes.ts` — `GET /` (:46), `/semantic-equivalences` (:97), `/enhanced-chain-links` (:118), `/cycles` (:140), `/:identifier` (:490)
- Modify: `packages/backend/src/routes/chain.routes.ts:20` (body `endpoint` on the execute route)
- Modify: `packages/backend/src/routes/vendor.routes.ts:22,66`
- Modify: `packages/backend/src/routes/shacl.routes.ts:96` (body `endpoint`)
- Modify: `packages/backend/src/routes/triplydb.routes.ts` — `POST /query` (:47, required `endpoint`)
- Modify tests: the matching `*.routes.test.ts`
- Modify: `packages/backend/openapi/openapi.yaml`, `packages/backend/openapi/.spectral.yaml`

**Interfaces:**

- Consumes: `refuseOptionalEndpoint`, `refuseTarget`, `checkSparqlEndpoint` (Task 1).

- [ ] **Step 1: Write the failing route tests.** In each route test file, add a `describe('#142 endpoint check', …)` with, per operation: a refused endpoint answers 400 problem details naming the reason, and the service was **not** called; `expectToMatchOperation` on the 400 (the conformance helper already used in these files). Example for `dmn.routes.test.ts`:

```ts
describe('#142 endpoint check', () => {
  test.each([
    ['/v1/dmns', 'getAllDmns'],
    ['/v1/dmns/semantic-equivalences', 'findSemanticEquivalences'],
    ['/v1/dmns/enhanced-chain-links', 'findEnhancedChainLinks'],
    ['/v1/dmns/cycles', 'detectChainCycles'],
    ['/v1/dmns/some-id', 'getDmnByIdentifier'],
  ])('%s refuses an internal endpoint without querying it', async (path, method) => {
    const res = await request(makeApp()).get(`${path}?endpoint=https://169.254.169.254/latest`);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'INVALID_INPUT', detail: '`endpoint` points to an internal address' });
    expect(sparqlMock[method]).not.toHaveBeenCalled();
    expectToMatchOperation(res, 'get', path.replace('/v1', '').replace('some-id', '{identifier}'));
  });
});
```

Adapt the mock names (`sparqlMock[...]`) and the `expectToMatchOperation` call signature to what each test file already uses — read the file's existing conformance calls first. For `POST /v1/triplydb/query` also test `endpoint: 'http://example.org/sparql'` → `'`endpoint` must use https'`. For chain execute and SHACL validate-merged the endpoint is in the body.

Existing tests that pass an `http://` or example endpoint: `http://` ones will now get 400. Change their endpoint to `https://triplydb.example/sparql` (a public-looking name; the route check does not resolve DNS) rather than deleting the test.

- [ ] **Step 2: Run to verify they fail** — the new cases get 200/500, not 400.

- [ ] **Step 3: Add the check to each route**, right after the endpoint is read and before any service call. Optional endpoints:

```ts
    const requestedEndpoint = req.query.endpoint as string | undefined;
    if (refuseOptionalEndpoint(res, req, req.query.endpoint, 'endpoint')) return;
```

Pass the raw `req.query.endpoint` / `req.body.endpoint`, not the `as string` cast, so an array is refused as "must be a string". `POST /triplydb/query`, where `endpoint` is required and already checked for presence:

```ts
    if (refuseTarget(res, req, checkSparqlEndpoint(endpoint, 'endpoint'))) return;
```

Place it after the existing missing-fields check.

- [ ] **Step 4: Run** the route tests touched — expected PASS.

- [ ] **Step 5: Document the 400s.** In `openapi.yaml`, each of these operations gains (or extends) a `'400'` response with `content: application/problem+json` referencing the existing `Problem` schema, as the #150 responses do (see the `'400':` at ~line 334 for the pattern). Description text:

> The `endpoint` was refused (code INVALID_INPUT; #142): not a string, not a valid URL, not `https:`, containing credentials, or pointing to an internal address. `detail` gives the reason. No request is made to it.

Where an operation already has a 400 (body-taking ones: MALFORMED_BODY from #143), extend its description with that sentence instead of adding a second 400. Update each operation's `endpoint` parameter/property description from "not validated (#142)" to state the rule.

- [ ] **Step 6: Lint exceptions.** In `.spectral.yaml`, the `problem-invalid-input` override at lines 42-55 loses `~1dmns/get`, `~1dmns~1semantic-equivalences/get`, `~1dmns~1enhanced-chain-links/get`, `~1dmns~1cycles/get` and `~1dmns~1%7Bidentifier%7D/get`; only `~1dmns~1%7Bidentifier%7D~1xml/get` remains, with its comment rewritten to that one operation's reason (a path identifier that resolves to 200 or 404; no endpoint). Remove any `/norms` `problem-invalid-input` entry if present. Leave the templates and `cache/clear` overrides: those routes do not request their `endpoint` (Global Constraints).

- [ ] **Step 7: Run** `npm run lint:openapi` and Spectral at every severity (`npx spectral lint openapi/openapi.json --ruleset openapi/.spectral.yaml --fail-severity hint` after the build) — expected clean. Run the OpenAPI coverage test (`npx jest --config jest.config.js --coverage=false src/openapi`). Typecheck, lint, format; stage.

---

### Task 5: TriplyDB token routes and the assets token

**Files:**

- Modify: `packages/backend/src/routes/triplydb.routes.ts` — `update-service` (:136-178), `list-graphs` (~~:238-258), `test-connection` (~~:318-334), `assets` (~:396-440)
- Modify: `packages/backend/src/routes/triplydb.routes.test.ts`
- Modify: `packages/frontend/src/utils/logoResolver.ts:73-86` and its test if one exists (`packages/frontend/src/utils/logoResolver.test.ts`)
- Modify: `packages/backend/openapi/openapi.yaml` (the three operations; `/triplydb/assets` at ~1790-1810)

**Interfaces:**

- Consumes: `checkTriplyDbBaseUrl`, `refuseTarget` (Task 1).

- [ ] **Step 1: Failing tests** in `triplydb.routes.test.ts`:

```ts
describe('#142 TriplyDB host allowlist', () => {
  test.each(['/update-service', '/list-graphs', '/test-connection'])(
    '%s refuses a host that is not allowed, without calling TriplyDB',
    async (path) => {
      const res = await request(makeApp())
        .post(`/v1/triplydb${path}`)
        .send({ config: { ...CONFIG, baseUrl: 'https://example.org' }, serviceName: 'svc' });
      expect(res.status).toBe(400);
      expect(res.body.detail).toBe('`config.baseUrl` host example.org is not an allowed TriplyDB host');
      for (const fn of Object.values(svc)) expect(fn).not.toHaveBeenCalled();
    }
  );

  test('test-connection refuses a config with missing fields', async () => {
    const res = await request(makeApp()).post('/v1/triplydb/test-connection').send({ config: {} });
    expect(res.status).toBe(400);
    expect(svc.testConnection).not.toHaveBeenCalled();
  });
});

describe('#142 GET /v1/triplydb/assets token', () => {
  test('forwards a bearer token from the Authorization header', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    await request(makeApp())
      .get('/v1/triplydb/assets?account=a&dataset=b')
      .set('Authorization', 'Bearer tok-9');
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok-9');
  });

  test('ignores an apiToken query parameter', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    await request(makeApp()).get('/v1/triplydb/assets?account=a&dataset=b&apiToken=leak');
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  test('encodes account and dataset into the upstream path', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    await request(makeApp()).get('/v1/triplydb/assets?account=a%2F..&dataset=b%3Fx%3D1');
    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://api.open-regels.triply.cc/datasets/a%2F../b%3Fx%3D1/assets'
    );
  });
});
```

Match `mockFetch`'s resolved shape to what the existing assets tests in this file already use.

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement.** In `update-service` and `list-graphs`, after the existing field checks:

```ts
    if (refuseTarget(res, req, checkTriplyDbBaseUrl(config.baseUrl, 'config.baseUrl'))) return;
```

In `test-connection`, add the same missing-fields check `update-service` has (`baseUrl`, `account`, `dataset` required; `apiToken` optional there, as today), answering 400 `INVALID_INPUT` with `detail: 'Invalid config: missing baseUrl, account or dataset'`, then the allowlist check. In `assets`:

```ts
    const { account, dataset } = req.query;
    // ...existing presence check...
    const url = `${baseUrl}/datasets/${encodeURIComponent(String(account))}/${encodeURIComponent(String(dataset))}/assets`;
    const authorization = req.get('authorization');
    if (authorization?.startsWith('Bearer ')) headers.Authorization = authorization;
```

- [ ] **Step 4: Frontend `logoResolver.ts`** — send the token as a header:

```ts
  const params = new URLSearchParams({ account, dataset });
  const response = await fetch(`${backendUrl}/v1/triplydb/assets?${params}`, {
    headers: apiToken ? { Authorization: `Bearer ${apiToken}` } : undefined,
  });
```

If a logoResolver test asserts the old query parameter, change it to assert the header. Run `npx vitest run src/utils/logoResolver` from `packages/frontend`.

- [ ] **Step 5: OpenAPI.** The three operations' 400 descriptions add: "`config.baseUrl` not `https:` or its host not in `TRIPLYDB_ALLOWED_HOSTS` (code INVALID_INPUT; #142)". `/triplydb/assets`: remove the `apiToken` query parameter (~line 1806) and its description (~1794); describe the optional `Authorization: Bearer` header in the operation description (header parameters named `Authorization` are ignored by OpenAPI 3, so say it in prose, or add a `bearerAuth` security scheme scoped to this operation if the document already has `components.securitySchemes`; check first).

- [ ] **Step 6: Run** the route tests, `npm run lint:openapi`, Spectral at every severity, the coverage test; typecheck, lint, format in both packages; stage.

---

### Task 6: Pin the Operaton deploy target

**Files:**

- Modify: `packages/backend/src/routes/dmn.routes.ts:225-310` (`POST /process/deploy`)
- Modify: `packages/backend/src/services/operaton.service.ts:663-701` (`deployProcess`)
- Modify tests: `packages/backend/src/routes/dmn.routes.test.ts` (process deploy cases), `packages/backend/src/services/operaton.service.test.ts`
- Modify: `packages/backend/openapi/openapi.yaml` (`/dmns/process/deploy` request body)

**Interfaces:**

- Consumes: `checkOperatonTarget`, `refuseTarget` (Task 1).
- Produces: `deployProcess(bpmnXml, deploymentName, forms, subProcesses = [], documents = [], boardOwner?, organization?)` — the three `operaton*` parameters are **removed**. Find every caller first: `grep -rn "deployProcess(" packages/backend/src`.

- [ ] **Step 1: Failing tests.** In the route test:

```ts
describe('#142 POST /v1/dmns/process/deploy target', () => {
  const body = { bpmnXml: '<definitions/>', deploymentName: 'd', organization: 'org' };

  test('a different operatonUrl answers 400 and nothing is deployed', async () => {
    const res = await request(makeApp())
      .post('/v1/dmns/process/deploy')
      .send({ ...body, operatonUrl: 'https://evil.example/engine-rest' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_INPUT');
    expect(operatonMock.deployProcess).not.toHaveBeenCalled();
  });

  test('the configured operatonUrl is accepted, and credentials in the body are not passed on', async () => {
    operatonMock.deployProcess.mockResolvedValue({ deploymentId: 'dep-1', resourceCount: 1 });
    const res = await request(makeApp())
      .post('/v1/dmns/process/deploy')
      .send({ ...body, operatonUrl: config.operaton.baseUrl, operatonUsername: 'u', operatonPassword: 'p' });
    expect(res.status).toBe(200);
    expect(operatonMock.deployProcess.mock.calls[0]).not.toContain('u');
    expect(operatonMock.deployProcess.mock.calls[0]).not.toContain('p');
  });

  test('the bundle record carries the configured Operaton URL', async () => {
    operatonMock.deployProcess.mockResolvedValue({ deploymentId: 'dep-1', resourceCount: 1 });
    await request(makeApp()).post('/v1/dmns/process/deploy').send(body);
    expect(recordDeployedBundleMock).toHaveBeenCalledWith(
      expect.objectContaining({ operatonUrl: config.operaton.baseUrl })
    );
  });
});
```

Use the mock names this test file already has for the Operaton service and `recordDeployedBundle`; set `config.operaton.baseUrl` in the test if it is empty under `NODE_ENV=test`. In `operaton.service.test.ts`, replace any test that deploys to a caller-supplied URL with one asserting `deployProcess` posts through the shared client (`this.client`).

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement.** Route: keep destructuring `operatonUrl` (drop `operatonUsername`, `operatonPassword` from the destructure; leave them in the TS body type marked `/** @deprecated ignored (#142) */`), then after the `organization` check:

```ts
    // The deploy target is the configured Operaton, never the caller's (#142).
    // A matching operatonUrl is still accepted so an older frontend keeps working.
    if (operatonUrl !== undefined && refuseTarget(res, req, checkOperatonTarget(operatonUrl, 'operatonUrl'))) {
      return;
    }
```

Call `operatonService.deployProcess(bpmnXml, deploymentName, forms, subProcesses, documents, boardOwner, organization)` and pass `operatonUrl: config.operaton.baseUrl` to `recordDeployedBundle`. Service: delete the three parameters and the `client` ternary; use `this.client` for the deploy POST. Update the JSDoc.

- [ ] **Step 4: Run** the two test files — PASS.

- [ ] **Step 5: OpenAPI.** On `/dmns/process/deploy`: `operatonUrl`, `operatonUsername`, `operatonPassword` get `deprecated: true`; `operatonUrl`'s description: "Ignored unless it differs from the configured Operaton, which answers 400 (#142). Deploys always go to the backend's configured Operaton."; the credentials': "Ignored (#142)." The 400 description adds the `operatonUrl` case. Run `npm run lint:openapi`, Spectral at every severity, the coverage test; typecheck, lint, format; stage.

---

### Task 7: Frontend — deploy modal and the local preset

**Files:**

- Modify: `packages/frontend/src/components/BpmnModeler/BpmnCanvas.tsx` (state :148-152, request body :669-681, modal fields :1020-1057)
- Modify: `packages/frontend/src/utils/constants.ts:1-14`
- Modify: `packages/frontend/src/App.tsx:52-53,138-139`
- Test: `packages/frontend/src/utils/constants.test.ts` (create), and the BpmnCanvas test if one exists (`find packages/frontend/src -name "BpmnCanvas*.test.tsx"`)

**Interfaces:**

- Produces: `presetEndpoints(isDev: boolean)`, `PRESET_ENDPOINTS`, `DEFAULT_SELECTED_ENDPOINT: string` in `constants.ts`.

- [ ] **Step 1: Failing tests** — `constants.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { presetEndpoints } from './constants';

describe('presetEndpoints', () => {
  test('includes the local Jena preset in development', () => {
    expect(presetEndpoints(true).map((p) => p.name)).toContain('Local Jena');
  });

  test('leaves it out of acceptance and production builds, where the backend refuses it', () => {
    const presets = presetEndpoints(false);
    expect(presets.map((p) => p.name)).not.toContain('Local Jena');
    expect(presets.every((p) => p.url.startsWith('https://'))).toBe(true);
  });
});
```

If a BpmnCanvas test exists, add: the deploy modal renders no Operaton URL, username or password inputs, and the deploy request body has no `operatonUrl`, `operatonUsername` or `operatonPassword`.

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/utils/constants.test.ts`.

- [ ] **Step 3: `constants.ts`**

```ts
const ALL_PRESET_ENDPOINTS = [
  { name: 'Local Jena', url: 'http://localhost:3030/ds/query' },
  // ...the two existing https presets, unchanged...
];

/** The local preset only works where the backend allows local endpoints (#142). */
export function presetEndpoints(isDev: boolean) {
  return isDev ? ALL_PRESET_ENDPOINTS : ALL_PRESET_ENDPOINTS.filter((p) => p.url.startsWith('https://'));
}

export const PRESET_ENDPOINTS = presetEndpoints(import.meta.env.DEV);

/** Selected on load. By URL, not by index: the preset list differs between builds. */
export const DEFAULT_SELECTED_ENDPOINT =
  'https://api.open-regels.triply.cc/datasets/stevengort/DMN-discovery/services/DMN-discovery/sparql';
```

`App.tsx`: both `PRESET_ENDPOINTS[1]?.url || PRESET_ENDPOINTS[0].url` become `DEFAULT_SELECTED_ENDPOINT` (import it). This keeps DMN Discovery the default in every build.

- [ ] **Step 4: `BpmnCanvas.tsx`** — remove the `operatonUrl`, `operatonUsername`, `operatonPassword` state and their inputs; drop `operatonUrl` from the request body. Where the URL input was, render:

```tsx
<p className="text-sm text-slate-600">
  Deploys to {import.meta.env.VITE_OPERATON_BASE_URL || "the backend's configured Operaton"}.
</p>
```

Match the surrounding modal's text classes rather than these if they differ.

- [ ] **Step 5: Run** `npx vitest run src/utils/constants.test.ts src/components/BpmnModeler` and `npm run typecheck && npm run lint` in `packages/frontend`. Stage.

---

### Task 8: Record it

**Files:**

- Modify: `docs/superpowers/specs/2026-09-18-outbound-targets-design.md`
- Modify: `packages/backend/.env` is **not** touched (untracked, the user's own); tell the user to add `ALLOW_LOCAL_ENDPOINTS=true` to it for local Jena.

- [ ] **Step 1: Spec corrections.** In the spec: "The three `fetch` calls" → "The five `fetch` calls"; the rules table's SPARQL row and the Problem paragraph: drop "template" and say the template routes and `DELETE /cache/clear` take an `endpoint` they never request, so they are not validated.

- [ ] **Step 2: Full verification** (controller): backend full suite serially and in parallel, frontend full suite, `lint:openapi` + Spectral every severity, typecheck/lint/format in both packages. Live against the local stack: with `ALLOW_LOCAL_ENDPOINTS` unset, `GET /v1/dmns?endpoint=http://localhost:3030/ds/query` answers 400 and `?endpoint=<RONL https URL>` answers 200; with it set, the Jena preset works. Checking this needs a backend restart between the two settings — ask the user to restart it; never restart it yourself.

- [ ] **Step 3: Issue bookkeeping** (after the user approves the text): file the inbound-authorisation issue, and comment on #142 linking it and recording the split.
