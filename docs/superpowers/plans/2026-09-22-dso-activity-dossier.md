# DSO Activity Dossier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Assemble an IMOW activity's full chain — legal source, annotations, decision criteria, submission requirements — as one backend call, and score how legible that chain is.

**Architecture:** A new `ozon.service.ts` wraps the Omgevingsdocumenten Presenteren v8 API (the sixth DSO API, currently unproxied). `dossier.service.ts` is the single place the four links join; `quality.service.ts` is a pure function scoring a finished dossier. A shared `utils/ttl-cache.ts` replaces what would have been a second hand-rolled cache and is applied to the existing activity-detail lookup, removing the repeat cost from the DSO Explorer's child-activity fan-out.

**Tech Stack:** TypeScript, Express, Jest + supertest, `fast-xml-parser` (already a dependency).

**Spec:** `docs/superpowers/specs/2026-09-22-dso-activity-dossier-design.md`

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the spec.

- **Ozon base URL:** `https://service.pre.omgevingswet.overheid.nl/publiek/omgevingsdocumenten/api/presenteren/v8` (pre) and `https://service.omgevingswet.overheid.nl/publiek/omgevingsdocumenten/api/presenteren/v8` (prod).
- **`Content-Crs` header value must be exactly** `http://www.opengis.net/def/crs/EPSG/0/28992`. `EPSG:28992` and `epsg:28992` are both rejected with a 400 naming the header.
- **Identificatie slashes become underscores in path position.** `/akn/nl/act/gm0995/2020/omgevingsplan` → `_akn_nl_act_gm0995_2020_omgevingsplan`. Percent-encoding the slashes returns a Tomcat HTML 400, not JSON.
- **Toepasbare-regel ids are environment-specific and collide silently.** Never carry an id across environments; always resolve from `functioneleStructuurRef` within the requested env. Every fixture records which env it came from.
- **GUID detection must accept both separators:** `[0-9a-f]{8}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{12}`, case-insensitive. `normalizeDmnForOperaton` rewrites hyphens to underscores.
- **`uitv:vraagTekst` content is CDATA.** Never strip it with a `<[^>]+>` replace.
- **TTLs:** activity detail 5 minutes; annotation graph 15 minutes.
- **No existing route changes its contract.** Caching sits behind unchanged response shapes.
- **Non-goals:** a concurrency cap on the fan-out; migrating `sparql.service.ts` onto the shared cache; a UI panel.
- **Never start, stop or restart a dev server.** Run tests against whatever is already running.
- **Never pass `--no-verify`** or otherwise bypass a hook. If a hook fails, report it.
- **Commit messages end with their substantive content** — no attribution trailers.

**Commands:**
- Backend tests: `npm test --workspace=@linked-data-explorer/backend`
- Single file: `npx jest --config packages/backend/jest.config.js <path> --coverage=false` (run from repo root — `npx jest` from the root without `--config` ignores the backend config and can report false passes)
- Typecheck: `npm run typecheck --workspace=@linked-data-explorer/backend`
- Lint: `npm run lint --workspace=@linked-data-explorer/backend`

## File Structure

| File | Responsibility |
|---|---|
| `packages/backend/src/utils/ttl-cache.ts` | generic TTL cache + registry (new) |
| `packages/backend/src/utils/ttl-cache.test.ts` | its tests (new) |
| `packages/backend/src/services/dso.service.ts` | + cached `getActiviteit`, + extended `dsoFetch` (modify) |
| `packages/backend/src/services/ozon.service.ts` | Presenteren v8 client (new) |
| `packages/backend/src/services/ozon.service.test.ts` | its tests (new) |
| `packages/backend/src/services/dossier.service.ts` | the four-link join (new) |
| `packages/backend/src/services/dossier.service.test.ts` | its tests (new) |
| `packages/backend/src/services/quality.service.ts` | dossier → quality profile, pure (new) |
| `packages/backend/src/services/quality.service.test.ts` | its tests (new) |
| `packages/backend/src/routes/dso.routes.ts` | + 3 passthrough + 1 composite route (modify) |
| `packages/backend/src/routes/cache.routes.ts` | + shared-cache stats/clear (modify) |
| `packages/backend/src/utils/config.ts` | + `ozonBaseUrl` on both env blocks (modify) |
| `packages/backend/openapi/` | + 4 route definitions (modify) |
| `packages/backend/src/__fixtures__/annotaties-gm0995-prod.json` | trimmed annotation fixture (new) |
| `scripts/dso-dossier.mjs` | renders dossier + profile to Markdown (new) |
| `docs/dso-activity-dossier.md` | the method doc (new) |
| `docs/examples/dossier-houtopstandvellen-gm0995.md` | worked example (new) |

---

### Task 1: Shared TTL cache utility

**Files:**
- Create: `packages/backend/src/utils/ttl-cache.ts`
- Test: `packages/backend/src/utils/ttl-cache.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `createTtlCache<T>({ name, ttlMs, now? }): TtlCache<T>`, `allCacheStats(): Record<string, TtlCacheStats>`, `clearNamedCaches(name?: string): void`, and types `TtlCache<T>`, `TtlCacheStats`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/backend/src/utils/ttl-cache.test.ts
import { createTtlCache, allCacheStats, clearNamedCaches } from './ttl-cache';

describe('createTtlCache', () => {
  test('returns a stored value before the TTL elapses', () => {
    let t = 1000;
    const cache = createTtlCache<string>({ name: 'test-a', ttlMs: 5000, now: () => t });
    cache.set('k', 'v');
    t = 4999;
    expect(cache.get('k')).toBe('v');
  });

  test('drops a value once the TTL has elapsed', () => {
    let t = 1000;
    const cache = createTtlCache<string>({ name: 'test-b', ttlMs: 5000, now: () => t });
    cache.set('k', 'v');
    t = 6001;
    expect(cache.get('k')).toBeUndefined();
  });

  test('returns undefined for a key never set', () => {
    const cache = createTtlCache<string>({ name: 'test-c', ttlMs: 5000 });
    expect(cache.get('absent')).toBeUndefined();
  });

  test('clear() with a key removes only that key', () => {
    const cache = createTtlCache<string>({ name: 'test-d', ttlMs: 5000 });
    cache.set('a', '1');
    cache.set('b', '2');
    cache.clear('a');
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('2');
  });

  test('clear() with no key empties the cache', () => {
    const cache = createTtlCache<string>({ name: 'test-e', ttlMs: 5000 });
    cache.set('a', '1');
    cache.clear();
    expect(cache.get('a')).toBeUndefined();
  });

  test('stats report size, ttl and the oldest entry age', () => {
    let t = 1000;
    const cache = createTtlCache<string>({ name: 'test-f', ttlMs: 5000, now: () => t });
    cache.set('a', '1');
    t = 3000;
    expect(cache.stats()).toEqual({ size: 1, ttlSeconds: 5, oldestAgeSeconds: 2 });
  });

  test('a registered cache appears in allCacheStats and is cleared by name', () => {
    const cache = createTtlCache<string>({ name: 'test-g', ttlMs: 5000 });
    cache.set('a', '1');
    expect(allCacheStats()['test-g'].size).toBe(1);
    clearNamedCaches('test-g');
    expect(cache.get('a')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config packages/backend/jest.config.js src/utils/ttl-cache --coverage=false`
Expected: FAIL — `Cannot find module './ttl-cache'`

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/backend/src/utils/ttl-cache.ts

/**
 * The one caching mechanism in this package.
 *
 * `sparql.service.ts` keeps its own private `dmnCacheMap` — migrating it is a
 * deliberate non-goal (see the design doc). Anything new caches here, so the
 * repository does not acquire a third hand-rolled cache.
 */

export interface TtlCacheStats {
  size: number;
  ttlSeconds: number;
  /** Age of the oldest live entry, or null when the cache is empty. */
  oldestAgeSeconds: number | null;
}

export interface TtlCache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  /** Removes one key, or every key when called with no argument. */
  clear(key?: string): void;
  stats(): TtlCacheStats;
}

interface Entry<T> {
  value: T;
  storedAt: number;
}

const registry = new Map<string, TtlCache<unknown>>();

export function createTtlCache<T>(opts: {
  name: string;
  ttlMs: number;
  /** Injected so expiry is tested without waiting. */
  now?: () => number;
}): TtlCache<T> {
  const { name, ttlMs, now = () => Date.now() } = opts;
  const entries = new Map<string, Entry<T>>();

  const cache: TtlCache<T> = {
    get(key) {
      const hit = entries.get(key);
      if (!hit) return undefined;
      if (now() - hit.storedAt > ttlMs) {
        entries.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key, value) {
      entries.set(key, { value, storedAt: now() });
    },
    clear(key) {
      if (key === undefined) entries.clear();
      else entries.delete(key);
    },
    stats() {
      let oldest: number | null = null;
      const t = now();
      for (const entry of entries.values()) {
        const age = Math.floor((t - entry.storedAt) / 1000);
        if (oldest === null || age > oldest) oldest = age;
      }
      return { size: entries.size, ttlSeconds: Math.floor(ttlMs / 1000), oldestAgeSeconds: oldest };
    },
  };

  registry.set(name, cache as TtlCache<unknown>);
  return cache;
}

export function allCacheStats(): Record<string, TtlCacheStats> {
  const out: Record<string, TtlCacheStats> = {};
  for (const [name, cache] of registry) out[name] = cache.stats();
  return out;
}

export function clearNamedCaches(name?: string): void {
  if (name === undefined) {
    for (const cache of registry.values()) cache.clear();
    return;
  }
  registry.get(name)?.clear();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --config packages/backend/jest.config.js src/utils/ttl-cache --coverage=false`
Expected: PASS — 7 tests

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/utils/ttl-cache.ts packages/backend/src/utils/ttl-cache.test.ts
git commit -m "feat(backend): add a shared TTL cache utility with a named registry"
```

---

### Task 2: Cache the DSO activity-detail lookup

Removes the repeat cost from the DSO Explorer's child-activity fan-out, which discards every resolved name on each effect run and refetches. Does **not** address the cold first-view burst — that is an explicit non-goal.

**Files:**
- Modify: `packages/backend/src/services/dso.service.ts` (`getActiviteit`, around line 274)
- Modify: `packages/backend/src/routes/cache.routes.ts`
- Test: `packages/backend/src/services/dso.service.test.ts` (append)

**Interfaces:**
- Consumes: `createTtlCache`, `allCacheStats`, `clearNamedCaches` from Task 1.
- Produces: `getActiviteit(urn, datum?, env?)` — unchanged signature and return shape, now cached under the registry name `dso-activiteit`.

- [ ] **Step 1: Write the failing test**

Append to `packages/backend/src/services/dso.service.test.ts`:

```ts
import { clearNamedCaches } from '../utils/ttl-cache';

describe('getActiviteit caching', () => {
  const urn = 'nl.imow-gm0995.activiteit.HoutopstandVellen';

  beforeEach(() => {
    clearNamedCaches('dso-activiteit');
    (global.fetch as jest.Mock).mockReset();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ urn, omschrijving: 'Boom kappen of houtopstand vellen' }),
    });
  });

  test('a repeated lookup makes no second upstream request', async () => {
    await dsoService.getActiviteit(urn, '22-09-2026', 'prod');
    await dsoService.getActiviteit(urn, '22-09-2026', 'prod');

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('the cached response is identical to the uncached one', async () => {
    const first = await dsoService.getActiviteit(urn, '22-09-2026', 'prod');
    const second = await dsoService.getActiviteit(urn, '22-09-2026', 'prod');

    expect(second).toEqual(first);
  });

  test('a different env is a different cache key', async () => {
    await dsoService.getActiviteit(urn, '22-09-2026', 'prod');
    await dsoService.getActiviteit(urn, '22-09-2026', 'pre');

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('a different datum is a different cache key', async () => {
    await dsoService.getActiviteit(urn, '22-09-2026', 'prod');
    await dsoService.getActiviteit(urn, '01-01-2024', 'prod');

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('clearing the named cache forces a refetch', async () => {
    await dsoService.getActiviteit(urn, '22-09-2026', 'prod');
    clearNamedCaches('dso-activiteit');
    await dsoService.getActiviteit(urn, '22-09-2026', 'prod');

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config packages/backend/jest.config.js src/services/dso.service --coverage=false -t "getActiviteit caching"`
Expected: FAIL — "a repeated lookup makes no second upstream request" gets 2 calls, not 1

- [ ] **Step 3: Write minimal implementation**

Add near the top of `dso.service.ts`, after the existing imports:

```ts
import { createTtlCache } from '../utils/ttl-cache';

/**
 * Activity detail is the hottest DSO read: the DSO Explorer's child-activity
 * fan-out calls it once per child and discards the names on every re-render.
 * Five minutes matches the house default in `sparql.service.ts`.
 *
 * Staleness is accepted deliberately — DSO activity data does change, so
 * `DELETE /v1/cache/clear` is the escape hatch.
 */
const activiteitCache = createTtlCache<unknown>({ name: 'dso-activiteit', ttlMs: 5 * 60 * 1000 });
```

Then replace the body of `getActiviteit` (line 274 onward) with:

```ts
export async function getActiviteit(
  urn: string,
  datum?: string,
  env: DsoEnv = 'pre'
): Promise<unknown> {
  const d = new Date();
  const today = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  const effectiveDatum = datum ?? today;

  const cacheKey = `${env}|${urn}|${effectiveDatum}`;
  const cached = activiteitCache.get(cacheKey);
  if (cached !== undefined) {
    logger.info('[DSO] activiteit detail from cache', { env, urn, datum: effectiveDatum });
    return cached;
  }

  const params = new URLSearchParams();
  params.set('datum', effectiveDatum);

  const url = `${getDsoConfig(env).rtrBaseUrl}/activiteiten/${encodeURIComponent(urn)}?${params}`;
  logger.info('[DSO] GET activiteit detail', { env, urn, datum: effectiveDatum });
  const data = await dsoFetch(url, env);
  activiteitCache.set(cacheKey, data);
  return data;
}
```

In `cache.routes.ts`, merge the shared caches into the existing stats and clear handlers. Add the import:

```ts
import { allCacheStats, clearNamedCaches } from '../utils/ttl-cache';
```

In the `GET /v1/cache/stats` handler, replace `const stats = sparqlService.getCacheStats();` with:

```ts
const stats = { ...sparqlService.getCacheStats(), ...allCacheStats() };
```

In the `DELETE /v1/cache/clear` handler, add `clearNamedCaches(endpoint)` next to the existing
`sparqlService.clearCache(endpoint)` call, and `clearNamedCaches()` next to `sparqlService.clearCache()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --config packages/backend/jest.config.js src/services/dso.service src/routes/cache --coverage=false`
Expected: PASS — the 5 new tests plus every pre-existing test in both files

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/services/dso.service.ts packages/backend/src/services/dso.service.test.ts packages/backend/src/routes/cache.routes.ts
git commit -m "perf(dso): cache activity detail, removing the fan-out's repeat cost"
```

---

### Task 3: Ozon configuration and a POST-capable `dsoFetch`

**Files:**
- Modify: `packages/backend/src/utils/config.ts` (the `dso` block from line 85, the `dsoProd` block from line 105)
- Modify: `packages/backend/src/services/dso.service.ts` (`dsoFetch`, line 19)
- Modify: `packages/backend/.env.example` (after line 106)
- Test: `packages/backend/src/services/dso.service.test.ts` (append)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `config.dso.ozonBaseUrl` and `config.dsoProd.ozonBaseUrl`; `dsoFetch(url, env, init?)` where `init` is `{ method?: 'GET' | 'POST'; body?: unknown; headers?: Record<string, string> }`.

- [ ] **Step 1: Write the failing test**

Append to `packages/backend/src/services/dso.service.test.ts`:

```ts
describe('dsoFetch request options', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockReset();
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  });

  test('defaults to GET with hal+json and no body', async () => {
    await dsoService.getActiviteiten({ datum: '22-09-2026' }, 'pre');

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.method ?? 'GET').toBe('GET');
    expect(init.headers.Accept).toBe('application/hal+json');
    expect(init.body).toBeUndefined();
  });

  test('sends a JSON body and extra headers when asked', async () => {
    await dsoService.dsoFetch('https://example.test/x', 'pre', {
      method: 'POST',
      body: { bevoegdGezag: ['gm0995'] },
      headers: { 'Content-Crs': 'http://www.opengis.net/def/crs/EPSG/0/28992' },
    });

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers['Content-Crs']).toBe('http://www.opengis.net/def/crs/EPSG/0/28992');
    expect(JSON.parse(init.body)).toEqual({ bevoegdGezag: ['gm0995'] });
  });
});

describe('ozon configuration', () => {
  test('both environments expose a presenteren v8 base URL', () => {
    expect(config.dso.ozonBaseUrl).toContain('/omgevingsdocumenten/api/presenteren/v8');
    expect(config.dsoProd.ozonBaseUrl).toContain('/omgevingsdocumenten/api/presenteren/v8');
    expect(config.dsoProd.ozonBaseUrl).toContain('service.omgevingswet.overheid.nl');
  });
});
```

Add `import { config } from '../utils/config';` to the test file if it is not already imported.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config packages/backend/jest.config.js src/services/dso.service --coverage=false -t "dsoFetch request options"`
Expected: FAIL — `dsoService.dsoFetch is not a function` (it is currently module-private)

- [ ] **Step 3: Write minimal implementation**

In `config.ts`, add to the `dso` block:

```ts
    ozonBaseUrl:
      process.env.DSO_OZON_BASE_URL ||
      'https://service.pre.omgevingswet.overheid.nl/publiek/omgevingsdocumenten/api/presenteren/v8',
```

and to the `dsoProd` block:

```ts
    ozonBaseUrl:
      process.env.DSO_OZON_BASE_URL_PROD ||
      'https://service.omgevingswet.overheid.nl/publiek/omgevingsdocumenten/api/presenteren/v8',
```

In `dso.service.ts`, replace `dsoFetch` and export it:

```ts
export interface DsoFetchInit {
  method?: 'GET' | 'POST';
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Internal fetch helper for all DSO API calls.
 * Attaches the x-api-key header and enforces the configured timeout.
 *
 * Exported so `ozon.service.ts` shares one timeout, key-attachment and error
 * contract with the five original APIs.
 */
export async function dsoFetch(
  url: string,
  env: DsoEnv = 'pre',
  init: DsoFetchInit = {}
): Promise<unknown> {
  const dsoConfig = getDsoConfig(env);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.dso.timeout);

  try {
    const response = await fetch(url, {
      method: init.method ?? 'GET',
      headers: {
        'x-api-key': dsoConfig.apiKey,
        Accept: 'application/hal+json',
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`DSO responded ${response.status}: ${body}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}
```

In `.env.example`, after the existing DSO block:

```
DSO_OZON_BASE_URL=https://service.pre.omgevingswet.overheid.nl/publiek/omgevingsdocumenten/api/presenteren/v8
DSO_OZON_BASE_URL_PROD=https://service.omgevingswet.overheid.nl/publiek/omgevingsdocumenten/api/presenteren/v8
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --config packages/backend/jest.config.js src/services/dso.service --coverage=false`
Expected: PASS — the new tests plus every pre-existing test in the file (the default-GET test proves no existing call site changed behaviour)

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/utils/config.ts packages/backend/src/services/dso.service.ts packages/backend/src/services/dso.service.test.ts packages/backend/.env.example
git commit -m "feat(dso): add Ozon base URLs and teach dsoFetch POST bodies and extra headers"
```

---

### Task 4: `ozon.service.ts` — the Presenteren v8 client

**Files:**
- Create: `packages/backend/src/services/ozon.service.ts`
- Test: `packages/backend/src/services/ozon.service.test.ts`

**Interfaces:**
- Consumes: `dsoFetch`, `DsoEnv` from Task 3; `createTtlCache` from Task 1.
- Produces:
  - `toOzonPathId(identificatie: string): string`
  - `zoekRegelingen(body: { bevoegdGezag?: string[]; typeBevoegdGezag?: string[] }, env: DsoEnv, opts?: { size?: number }): Promise<unknown>`
  - `getRegeltekstAnnotaties(regelingPathId: string, env: DsoEnv, opts?: { geldigOp?: string }): Promise<OzonAnnotaties>`
  - `getDocumentComponent(regelingPathId: string, wId: string, env: DsoEnv): Promise<unknown>`
  - `CONTENT_CRS: string`
  - types `OzonAnnotaties`, `OzonActiviteit`, `OzonJuridischeRegel`, `OzonRegeltekst`, `OzonLocatie`

- [ ] **Step 1: Write the failing test**

```ts
// packages/backend/src/services/ozon.service.test.ts
jest.mock('../utils/logger', () => ({
  __esModule: true,
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import * as ozon from './ozon.service';

describe('toOzonPathId', () => {
  test('replaces every slash with an underscore', () => {
    expect(ozon.toOzonPathId('/akn/nl/act/gm0995/2020/omgevingsplan')).toBe(
      '_akn_nl_act_gm0995_2020_omgevingsplan'
    );
  });

  test('leaves an already-transformed id untouched', () => {
    expect(ozon.toOzonPathId('_akn_nl_act_gm0995_2020_omgevingsplan')).toBe(
      '_akn_nl_act_gm0995_2020_omgevingsplan'
    );
  });

  test('never percent-encodes a slash', () => {
    expect(ozon.toOzonPathId('/akn/nl/act/gm0995/2020/omgevingsplan')).not.toContain('%2F');
  });
});

describe('ozon requests', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ _embedded: { regelingen: [] } }),
    });
    ozon.__clearAnnotatiesCache();
  });

  test('zoekRegelingen POSTs the body with the full OGC Content-Crs', async () => {
    await ozon.zoekRegelingen({ bevoegdGezag: ['gm0995'] }, 'prod', { size: 100 });

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('/regelingen/_zoek');
    expect(url).toContain('size=100');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Crs']).toBe('http://www.opengis.net/def/crs/EPSG/0/28992');
    expect(JSON.parse(init.body)).toEqual({ bevoegdGezag: ['gm0995'] });
  });

  test('zoekRegelingen targets production when env is prod', async () => {
    await ozon.zoekRegelingen({ bevoegdGezag: ['gm0995'] }, 'prod');

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('https://service.omgevingswet.overheid.nl');
    expect(url).toContain('/presenteren/v8');
  });

  test('getRegeltekstAnnotaties builds the underscore path and caches the result', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ activiteiten: [], regelsVoorIedereen: [], regelteksten: [], locaties: [] }),
    });

    await ozon.getRegeltekstAnnotaties('_akn_nl_act_gm0995_2020_omgevingsplan', 'prod', {
      geldigOp: '2026-09-22',
    });
    await ozon.getRegeltekstAnnotaties('_akn_nl_act_gm0995_2020_omgevingsplan', 'prod', {
      geldigOp: '2026-09-22',
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('/regelingen/_akn_nl_act_gm0995_2020_omgevingsplan/regeltekstannotaties');
    expect(url).toContain('geldigOp=2026-09-22');
  });

  test('getDocumentComponent requests the wId under documentstructuur', async () => {
    await ozon.getDocumentComponent(
      '_akn_nl_act_gm0995_2020_omgevingsplan',
      'gm0995_5e613b8efac0433cb977d3445e057208__chp_15__subchp_15.4__art_15.2__para_5',
      'prod'
    );

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('/documentstructuur/gm0995_5e613b8efac0433cb977d3445e057208__chp_15');
  });

  test('an upstream failure surfaces the status in the thrown message', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => '{"title":"Niet gevonden"}',
    });

    await expect(ozon.zoekRegelingen({ bevoegdGezag: ['gm0995'] }, 'prod')).rejects.toThrow('404');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config packages/backend/jest.config.js src/services/ozon.service --coverage=false`
Expected: FAIL — `Cannot find module './ozon.service'`

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/backend/src/services/ozon.service.ts

/**
 * Omgevingsdocumenten Presenteren (Ozon) v8 — the sixth DSO API, and the only
 * one carrying the juridical half of an activity's chain.
 *
 * Shares `dsoFetch` with the other five APIs so timeout, key attachment and
 * the error contract stay identical.
 */

import { dsoFetch, DsoEnv } from './dso.service';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { createTtlCache } from '../utils/ttl-cache';

/** Ozon rejects `EPSG:28992` and `epsg:28992`; only the full OGC URI is accepted. */
export const CONTENT_CRS = 'http://www.opengis.net/def/crs/EPSG/0/28992';

export interface OzonActiviteit {
  identificatie: string;
  naam?: string;
  groep?: { code: string; waarde: string };
  symboolcodes?: { vlak?: string };
  bovenliggendeActiviteitRef?: string;
}

export interface OzonRegeltekst {
  identificatie: string;
  wId: string;
}

export interface OzonLocatie {
  identificatie: string;
  naam?: string;
  noemer?: string;
  locatieType?: { code: string; waarde: string };
}

export interface OzonActiviteitLocatieaanduiding {
  identificatie: string;
  activiteitRef: string;
  activiteitregelkwalificatie?: { code: string; waarde: string };
  locatieRefs?: string[];
}

export interface OzonJuridischeRegel {
  identificatie: string;
  idealisatie?: { code: string; waarde: string };
  regeltekstRef: string;
  locatieRefs?: string[];
  activiteitLocatieaanduidingen?: OzonActiviteitLocatieaanduiding[];
}

/**
 * NOT a HAL collection: no `page`, no `_embedded`. Sibling arrays on one object.
 */
export interface OzonAnnotaties {
  activiteiten: OzonActiviteit[];
  regelteksten: OzonRegeltekst[];
  regelsVoorIedereen: OzonJuridischeRegel[];
  locaties: OzonLocatie[];
  gebiedsaanwijzingen?: unknown[];
  omgevingsnormen?: unknown[];
}

function baseUrl(env: DsoEnv): string {
  return env === 'prod' ? config.dsoProd.ozonBaseUrl : config.dso.ozonBaseUrl;
}

/**
 * Ozon puts a document identificatie in the path with underscores, not slashes.
 * Percent-encoding the slashes returns a Tomcat HTML 400, not a JSON error.
 */
export function toOzonPathId(identificatie: string): string {
  return identificatie.replace(/\//g, '_');
}

export async function zoekRegelingen(
  body: { bevoegdGezag?: string[]; typeBevoegdGezag?: string[] },
  env: DsoEnv = 'pre',
  opts: { size?: number } = {}
): Promise<unknown> {
  const params = new URLSearchParams({ size: String(opts.size ?? 100) });
  const url = `${baseUrl(env)}/regelingen/_zoek?${params}`;
  logger.info('[Ozon] POST regelingen/_zoek', { env, body });
  return dsoFetch(url, env, { method: 'POST', body, headers: { 'Content-Crs': CONTENT_CRS } });
}

/**
 * The annotation graph. 8.7 MB for the Lelystad omgevingsplan, so it is cached
 * for 15 minutes — longer than activity detail because it is far more
 * expensive and changes only on publication dates.
 */
const annotatiesCache = createTtlCache<OzonAnnotaties>({
  name: 'ozon-annotaties',
  ttlMs: 15 * 60 * 1000,
});

export async function getRegeltekstAnnotaties(
  regelingPathId: string,
  env: DsoEnv = 'pre',
  opts: { geldigOp?: string } = {}
): Promise<OzonAnnotaties> {
  const pathId = toOzonPathId(regelingPathId);
  const cacheKey = `${env}|${pathId}|${opts.geldigOp ?? 'today'}`;
  const cached = annotatiesCache.get(cacheKey);
  if (cached !== undefined) {
    logger.info('[Ozon] annotaties from cache', { env, pathId });
    return cached;
  }

  const params = new URLSearchParams();
  if (opts.geldigOp) params.set('geldigOp', opts.geldigOp);
  const query = params.toString();
  const url = `${baseUrl(env)}/regelingen/${pathId}/regeltekstannotaties${query ? `?${query}` : ''}`;
  logger.info('[Ozon] GET regeltekstannotaties', { env, pathId });

  const raw = (await dsoFetch(url, env, { headers: { 'Content-Crs': CONTENT_CRS } })) as Partial<OzonAnnotaties>;
  const data: OzonAnnotaties = {
    activiteiten: raw.activiteiten ?? [],
    regelteksten: raw.regelteksten ?? [],
    regelsVoorIedereen: raw.regelsVoorIedereen ?? [],
    locaties: raw.locaties ?? [],
    gebiedsaanwijzingen: raw.gebiedsaanwijzingen ?? [],
    omgevingsnormen: raw.omgevingsnormen ?? [],
  };
  annotatiesCache.set(cacheKey, data);
  return data;
}

export async function getDocumentComponent(
  regelingPathId: string,
  wId: string,
  env: DsoEnv = 'pre'
): Promise<unknown> {
  const pathId = toOzonPathId(regelingPathId);
  const url = `${baseUrl(env)}/regelingen/${pathId}/documentstructuur/${wId}`;
  logger.info('[Ozon] GET documentstructuur component', { env, pathId, wId });
  return dsoFetch(url, env, { headers: { 'Content-Crs': CONTENT_CRS } });
}

/** Test seam: lets a suite start from an empty annotation cache. */
export function __clearAnnotatiesCache(): void {
  annotatiesCache.clear();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --config packages/backend/jest.config.js src/services/ozon.service --coverage=false`
Expected: PASS — 8 tests

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/services/ozon.service.ts packages/backend/src/services/ozon.service.test.ts
git commit -m "feat(dso): add an Omgevingsdocumenten Presenteren v8 client"
```

---

### Task 5: Ozon passthrough routes

**Files:**
- Modify: `packages/backend/src/routes/dso.routes.ts` (append before `export default router`)
- Modify: `packages/backend/src/routes/dso.routes.test.ts` (extend the `jest.mock` for the new service, append describes)
- Modify: `packages/backend/openapi/` — add the three operations

**Interfaces:**
- Consumes: `zoekRegelingen`, `getRegeltekstAnnotaties`, `getDocumentComponent` from Task 4.
- Produces: `POST /v1/dso/regelingen/zoek`, `GET /v1/dso/regelingen/:id/annotaties`, `GET /v1/dso/regelingen/:id/documentstructuur/:wId`, each answering `{ success, data }`.

- [ ] **Step 1: Write the failing test**

In `dso.routes.test.ts`, add a mock for the new service next to the existing `jest.mock('../services/dso.service', …)`:

```ts
jest.mock('../services/ozon.service', () => ({
  __esModule: true,
  zoekRegelingen: jest.fn(),
  getRegeltekstAnnotaties: jest.fn(),
  getDocumentComponent: jest.fn(),
  toOzonPathId: (s: string) => s.replace(/\//g, '_'),
}));
```

and after the existing imports:

```ts
import * as ozonService from '../services/ozon.service';
const ozon = ozonService as unknown as Record<string, jest.Mock>;
```

Add to the `beforeEach` that resets mocks:

```ts
  for (const fn of Object.values(ozon)) {
    if (typeof fn === 'function' && 'mockReset' in fn) fn.mockReset();
  }
```

Then append:

```ts
describe('POST /v1/dso/regelingen/zoek', () => {
  test('passes the body and env through and returns the envelope', async () => {
    ozon.zoekRegelingen.mockResolvedValue({ _embedded: { regelingen: [] } });

    const res = await request(makeApp())
      .post('/v1/dso/regelingen/zoek')
      .set('X-Dso-Env', 'prod')
      .send({ bevoegdGezag: ['gm0995'] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { _embedded: { regelingen: [] } } });
    expect(ozon.zoekRegelingen).toHaveBeenCalledWith(
      { bevoegdGezag: ['gm0995'] },
      'prod',
      expect.anything()
    );
  });

  test('400 when bevoegdGezag and typeBevoegdGezag are both absent', async () => {
    const res = await request(makeApp()).post('/v1/dso/regelingen/zoek').send({});

    expect(res.status).toBe(400);
    expect(ozon.zoekRegelingen).not.toHaveBeenCalled();
  });

  test('502 carries the upstream message', async () => {
    ozon.zoekRegelingen.mockRejectedValue(new Error('DSO responded 500: boom'));

    const res = await request(makeApp())
      .post('/v1/dso/regelingen/zoek')
      .send({ bevoegdGezag: ['gm0995'] });

    expect(res.status).toBe(502);
  });
});

describe('GET /v1/dso/regelingen/:id/annotaties', () => {
  test('returns the annotation graph', async () => {
    ozon.getRegeltekstAnnotaties.mockResolvedValue({
      activiteiten: [],
      regelteksten: [],
      regelsVoorIedereen: [],
      locaties: [],
    });

    const res = await request(makeApp()).get(
      '/v1/dso/regelingen/_akn_nl_act_gm0995_2020_omgevingsplan/annotaties'
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('an upstream 404 passes through as 404', async () => {
    ozon.getRegeltekstAnnotaties.mockRejectedValue(new Error('DSO responded 404: not found'));

    const res = await request(makeApp()).get('/v1/dso/regelingen/_absent/annotaties');

    expect(res.status).toBe(404);
  });
});

describe('GET /v1/dso/regelingen/:id/documentstructuur/:wId', () => {
  test('returns the document component', async () => {
    ozon.getDocumentComponent.mockResolvedValue({ _embedded: { documentComponenten: [] } });

    const res = await request(makeApp()).get(
      '/v1/dso/regelingen/_akn_nl_act_gm0995_2020_omgevingsplan/documentstructuur/gm0995_x__art_15.2'
    );

    expect(res.status).toBe(200);
    expect(ozon.getDocumentComponent).toHaveBeenCalledWith(
      '_akn_nl_act_gm0995_2020_omgevingsplan',
      'gm0995_x__art_15.2',
      'pre'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config packages/backend/jest.config.js src/routes/dso.routes --coverage=false -t "regelingen"`
Expected: FAIL — all requests 404, the routes do not exist

- [ ] **Step 3: Write minimal implementation**

In `dso.routes.ts`, add the import:

```ts
import * as ozonService from '../services/ozon.service';
```

and append before `export default router`:

```ts
/**
 * POST /v1/dso/regelingen/zoek
 * Find an authority's regelingen. Body: { bevoegdGezag?: string[], typeBevoegdGezag?: string[] }
 */
router.post('/regelingen/zoek', async (req: Request, res: Response) => {
  res.set('API-Version', packageJson.version);
  try {
    const { bevoegdGezag, typeBevoegdGezag, size } = req.body as {
      bevoegdGezag?: string[];
      typeBevoegdGezag?: string[];
      size?: number;
    };
    if (!bevoegdGezag?.length && !typeBevoegdGezag?.length) {
      sendProblem(res, req, {
        status: 400,
        title: 'Invalid request',
        detail: 'bevoegdGezag or typeBevoegdGezag is required',
      });
      return;
    }
    const data = await ozonService.zoekRegelingen(
      { bevoegdGezag, typeBevoegdGezag },
      getEnv(req),
      { size }
    );
    res.status(200).json({ success: true, data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'DSO request failed';
    logger.error('[DSO Routes] POST /regelingen/zoek failed', { error: msg });
    const status = msg.includes('404') ? 404 : 502;
    sendProblem(res, req, {
      status,
      title: status === 404 ? 'Not found' : 'Upstream request failed',
      detail: msg,
    });
  }
});

/**
 * GET /v1/dso/regelingen/:id/annotaties
 * The regeltekst annotation graph for one regeling.
 */
router.get('/regelingen/:id/annotaties', async (req: Request, res: Response) => {
  res.set('API-Version', packageJson.version);
  try {
    const geldigOp = typeof req.query['geldigOp'] === 'string' ? req.query['geldigOp'] : undefined;
    const data = await ozonService.getRegeltekstAnnotaties(req.params['id'] as string, getEnv(req), {
      geldigOp,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'DSO request failed';
    logger.error('[DSO Routes] GET /regelingen/:id/annotaties failed', { error: msg });
    const status = msg.includes('404') ? 404 : 502;
    sendProblem(res, req, {
      status,
      title: status === 404 ? 'Not found' : 'Upstream request failed',
      detail: msg,
    });
  }
});

/**
 * GET /v1/dso/regelingen/:id/documentstructuur/:wId
 * One document component (an article or lid) with its STOP/IMOP content.
 */
router.get('/regelingen/:id/documentstructuur/:wId', async (req: Request, res: Response) => {
  res.set('API-Version', packageJson.version);
  try {
    const data = await ozonService.getDocumentComponent(
      req.params['id'] as string,
      req.params['wId'] as string,
      getEnv(req)
    );
    res.status(200).json({ success: true, data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'DSO request failed';
    logger.error('[DSO Routes] GET /regelingen/:id/documentstructuur/:wId failed', { error: msg });
    const status = msg.includes('404') ? 404 : 502;
    sendProblem(res, req, {
      status,
      title: status === 404 ? 'Not found' : 'Upstream request failed',
      detail: msg,
    });
  }
});
```

Add the three operations to `packages/backend/openapi/openapi.yaml`. Paths are authored
directly in that one file under top-level `paths:` keys such as `/dso/activiteiten/{urn}`
(around line 3735) — copy that entry's structure. Insert the new keys after
`/dso/activiteiten/{urn}`, keeping the file's existing ordering style:

- `/dso/regelingen/zoek` — `post`, `operationId: zoekDsoRegelingen`, `tags: [Integrations]`,
  request body `{ bevoegdGezag?: string[], typeBevoegdGezag?: string[], size?: integer }`,
  responses `200` (`{ success, data }`), `400`, `502`.
- `/dso/regelingen/{id}/annotaties` — `get`, `operationId: getDsoRegelingAnnotaties`, path
  param `id`, query param `geldigOp`, responses `200`, `404`, `502`.
- `/dso/regelingen/{id}/documentstructuur/{wId}` — `get`,
  `operationId: getDsoDocumentComponent`, path params `id` and `wId`, responses `200`,
  `404`, `502`.

Reuse the existing problem-details response component the other `/dso/*` entries
reference for `400`/`404`/`502` rather than declaring new inline schemas. `openapi.json`
is generated — do not hand-edit it; `npm run build:openapi` regenerates it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build:openapi --workspace=@linked-data-explorer/backend && npx jest --config packages/backend/jest.config.js src/routes/dso.routes src/openapi --coverage=false`
Expected: PASS — the new route tests and the OpenAPI conformance suite

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/dso.routes.ts packages/backend/src/routes/dso.routes.test.ts packages/backend/openapi
git commit -m "feat(dso): proxy the three Ozon Presenteren routes the dossier needs"
```

---

### Task 6: `dossier.service.ts` — the four-link join

**Files:**
- Create: `packages/backend/src/services/dossier.service.ts`
- Create: `packages/backend/src/__fixtures__/annotaties-gm0995-prod.json`
- Test: `packages/backend/src/services/dossier.service.test.ts`

**Interfaces:**
- Consumes: `getActiviteit`, `getToepasbareRegels`, `getSttrBestand`, `extractDmnFromSttr` from `dso.service` (the last is **synchronous** and takes STTR XML, not an id); `zoekRegelingen`, `getRegeltekstAnnotaties`, `getDocumentComponent`, `toOzonPathId` from Task 4.
- Produces: `buildDossier(req: DossierRequest): Promise<Dossier>` and the `Dossier`, `DossierRequest`, `LegalSource`, `RuleSet`, `Provenance` types. Task 8 consumes `Dossier`.

**Fixture:** build `annotaties-gm0995-prod.json` by taking the live production annotation graph for `_akn_nl_act_gm0995_2020_omgevingsplan` and keeping only: the `HoutopstandVellen` entry from `activiteiten`, the 10 `regelsVoorIedereen` whose `activiteitLocatieaanduidingen[].activiteitRef` is `nl.imow-gm0995.activiteit.HoutopstandVellen`, the `regelteksten` those reference, and the `locaties` those reference. Add a `"_source"` key recording `{"env":"prod","geldigOp":"2026-09-22"}` — fixtures must record their environment.

- [ ] **Step 1: Write the failing test**

```ts
// packages/backend/src/services/dossier.service.test.ts
jest.mock('../utils/logger', () => ({
  __esModule: true,
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('./dso.service', () => ({
  __esModule: true,
  getActiviteit: jest.fn(),
  getToepasbareRegels: jest.fn(),
  extractDmnFromSttr: jest.fn(),
  getSttrBestand: jest.fn(),
}));
jest.mock('./ozon.service', () => ({
  __esModule: true,
  zoekRegelingen: jest.fn(),
  getRegeltekstAnnotaties: jest.fn(),
  getDocumentComponent: jest.fn(),
  toOzonPathId: (s: string) => s.replace(/\//g, '_'),
}));

import * as dsoService from './dso.service';
import * as ozonService from './ozon.service';
import { buildDossier } from './dossier.service';
import annotaties from '../__fixtures__/annotaties-gm0995-prod.json';

const dso = dsoService as unknown as Record<string, jest.Mock>;
const ozon = ozonService as unknown as Record<string, jest.Mock>;

const URN = 'nl.imow-gm0995.activiteit.HoutopstandVellen';

const activiteit = {
  urn: URN,
  omschrijving: 'Boom kappen of houtopstand vellen',
  bestuursorgaan: { oin: '00000001005024249000', organisatieType: 'GM', organisatieCode: '0995' },
  regelBeheerObjecten: [
    {
      typering: 'Conclusie',
      functioneleStructuurRef: 'http://toepasbare-regels.omgevingswet.overheid.nl/x/id/concept/Conclusie' + URN,
    },
    {
      typering: 'Indieningsvereisten',
      toestemming: { code: 'Vergunning', waarde: 'Aanvraag vergunning' },
      functioneleStructuurRef:
        'http://toepasbare-regels.omgevingswet.overheid.nl/x/id/concept/IndieningsvereistenVergunning' + URN,
    },
  ],
  locaties: [{ identificatie: 'nl.imow-gm0995.gebiedengroep.180a63f795be43bf8683a480e75deb84' }],
};

beforeEach(() => {
  for (const fn of [...Object.values(dso), ...Object.values(ozon)]) {
    if (typeof fn === 'function' && 'mockReset' in fn) (fn as jest.Mock).mockReset();
  }
  dso.getActiviteit.mockResolvedValue(activiteit);
  ozon.zoekRegelingen.mockResolvedValue({
    _embedded: {
      regelingen: [
        {
          identificatie: '/akn/nl/act/gm0995/2020/omgevingsplan',
          type: { code: '/join/id/stop/regelingtype_003', waarde: 'Omgevingsplan' },
          officieleTitel: 'Omgevingsplan gemeente Lelystad',
        },
        {
          identificatie: '/akn/nl/act/gm0995/2025/Regeling6',
          type: { code: '/join/id/stop/regelingtype_006', waarde: 'Omgevingsvisie' },
        },
      ],
    },
  });
  ozon.getRegeltekstAnnotaties.mockResolvedValue(annotaties);
  ozon.getDocumentComponent.mockResolvedValue({
    _embedded: { documentComponenten: [{ inhoud: '<Inhoud><Al>Het is verboden…</Al></Inhoud>' }] },
  });
  dso.getToepasbareRegels.mockResolvedValue({
    _embedded: {
      toepasbareRegels: [{ identifier: 114233, sttrVersie: 2, begindatum: '30-07-2026' }],
    },
  });
  dso.getSttrBestand.mockResolvedValue('<sttr/>');
  dso.extractDmnFromSttr.mockReturnValue('<dmn:definitions/>'); // synchronous
});

describe('buildDossier', () => {
  test('selects the omgevingsplan, not another regeling of the same authority', async () => {
    const d = await buildDossier({ urn: URN, env: 'prod', datum: '22-09-2026' });

    expect(d.provenance.regelingIdentificatie).toBe('/akn/nl/act/gm0995/2020/omgevingsplan');
  });

  test('derives the bevoegdGezag code from the activity bestuursorgaan', async () => {
    await buildDossier({ urn: URN, env: 'prod' });

    expect(ozon.zoekRegelingen).toHaveBeenCalledWith(
      { bevoegdGezag: ['gm0995'] },
      'prod',
      expect.anything()
    );
  });

  test('joins the activity to its 10 juridische regels', async () => {
    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(d.legalSource.juridischeRegels).toHaveLength(10);
  });

  test('counts 5 rules qualified vergunningplicht', async () => {
    const d = await buildDossier({ urn: URN, env: 'prod' });

    const vergunning = d.legalSource.juridischeRegels.filter(
      (r) => r.kwalificatie === 'vergunningplicht'
    );
    expect(vergunning).toHaveLength(5);
  });

  test('reads the IMOW annotation groep from the annotation layer', async () => {
    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(d.annotation.groep).toBe('kapactiviteit');
    expect(d.annotation.bovenliggendeActiviteitRef).toBe('nl.imow-gm0995.activiteit.OverigeAct');
  });

  test('resolves locatie refs to readable names', async () => {
    const d = await buildDossier({ urn: URN, env: 'prod' });

    const names = d.legalSource.juridischeRegels.flatMap((r) => r.locaties.map((l) => l.naam));
    expect(names).toContain('bebouwingscontour, houtkap');
  });

  test('groups toepasbare regels into decision criteria and submission requirements', async () => {
    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(d.decisionCriteria?.identifier).toBe(114233);
    expect(d.submissionRequirements?.identifier).toBe(114233);
    expect(d.submissionRequirements?.toestemming).toBe('Aanvraag vergunning');
  });

  test('an activity with no regelBeheerObjecten yields absent rule sets, not an error', async () => {
    dso.getActiviteit.mockResolvedValue({ ...activiteit, regelBeheerObjecten: [] });

    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(d.decisionCriteria).toBeNull();
    expect(d.submissionRequirements).toBeNull();
    expect(dso.getToepasbareRegels).not.toHaveBeenCalled();
  });

  test('a failing article fetch records the reason and does not fail the dossier', async () => {
    ozon.getDocumentComponent.mockRejectedValue(new Error('DSO responded 500: boom'));

    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(d.legalSource.juridischeRegels).toHaveLength(10);
    expect(d.provenance.failures.some((f) => f.step === 'documentComponent')).toBe(true);
  });

  test('no regeling of type 003 marks the legal source unavailable', async () => {
    ozon.zoekRegelingen.mockResolvedValue({ _embedded: { regelingen: [] } });

    const d = await buildDossier({ urn: URN, env: 'prod' });

    expect(d.legalSource.available).toBe(false);
    expect(d.provenance.failures.some((f) => f.step === 'regeling')).toBe(true);
  });

  test('a national activity without an authority parameter is rejected', async () => {
    dso.getActiviteit.mockResolvedValue({
      ...activiteit,
      urn: 'nl.imow-mnre1034.activiteit.Iets',
      bestuursorgaan: { organisatieType: 'MNRE', organisatieCode: '1034' },
    });

    await expect(
      buildDossier({ urn: 'nl.imow-mnre1034.activiteit.Iets', env: 'prod' })
    ).rejects.toThrow('authority');
  });

  test('provenance records env and datum', async () => {
    const d = await buildDossier({ urn: URN, env: 'prod', datum: '22-09-2026' });

    expect(d.provenance.env).toBe('prod');
    expect(d.provenance.datum).toBe('22-09-2026');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config packages/backend/jest.config.js src/services/dossier.service --coverage=false`
Expected: FAIL — `Cannot find module './dossier.service'`

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/backend/src/services/dossier.service.ts

/**
 * The only place the four links join.
 *
 * legal source -> annotation -> decision criteria -> submission requirements,
 * assembled from the RTR, Ozon Presenteren v8 and Uitvoeren Gegevens.
 */

import * as dsoService from './dso.service';
import * as ozonService from './ozon.service';
import type { DsoEnv } from './dso.service';
import type { OzonAnnotaties } from './ozon.service';
import { logger } from '../utils/logger';

const OMGEVINGSPLAN_TYPE = '/join/id/stop/regelingtype_003';

export interface DossierRequest {
  urn: string;
  env: DsoEnv;
  datum?: string;
  /** Required for a national (mnre) activity: which authority's plan to scan. */
  authority?: string;
}

export interface ResolvedLocatie {
  identificatie: string;
  naam: string | null;
}

export interface JuridischeRegelEntry {
  identificatie: string;
  kwalificatie: string | null;
  idealisatie: string | null;
  regeltekstRef: string;
  wId: string | null;
  locaties: ResolvedLocatie[];
  articleText: string | null;
}

export interface LegalSource {
  available: boolean;
  regelingIdentificatie: string | null;
  regelingTitel: string | null;
  juridischeRegels: JuridischeRegelEntry[];
}

export interface Annotation {
  identificatie: string | null;
  naam: string | null;
  groep: string | null;
  symboolcode: string | null;
  bovenliggendeActiviteitRef: string | null;
}

export interface RuleSet {
  typering: 'Conclusie' | 'Indieningsvereisten';
  identifier: number;
  sttrVersie: number | null;
  begindatum: string | null;
  toestemming: string | null;
  functioneleStructuurRef: string;
  viewerUrl: string;
  dmn: string | null;
}

export interface Provenance {
  env: DsoEnv;
  datum: string | null;
  regelingIdentificatie: string | null;
  fetchedAt: string;
  failures: { step: string; detail: string }[];
}

export interface Dossier {
  urn: string;
  omschrijving: string | null;
  bestuursorgaan: { code: string; oin: string | null } | null;
  legalSource: LegalSource;
  annotation: Annotation;
  decisionCriteria: RuleSet | null;
  submissionRequirements: RuleSet | null;
  provenance: Provenance;
}

interface RegelBeheerObject {
  typering: string;
  functioneleStructuurRef: string;
  toestemming?: { code: string; waarde: string };
}

/** `GM` + `0995` -> `gm0995`, the code Ozon's regelingen search expects. */
function bevoegdGezagCode(bestuursorgaan: { organisatieType?: string; organisatieCode?: string }): string {
  return `${bestuursorgaan.organisatieType ?? ''}${bestuursorgaan.organisatieCode ?? ''}`.toLowerCase();
}

/**
 * The public RTR viewer link. The trailing concept name is what the RTR itself
 * supplies on the functioneleStructuurRef, so this is a substring, not a
 * string-built URL.
 */
function viewerUrl(functioneleStructuurRef: string): string {
  const concept = functioneleStructuurRef.split('/id/concept/')[1] ?? '';
  return `https://omgevingswet.overheid.nl/registratie-toepasbare-regels/id/${concept}`;
}

export async function buildDossier(req: DossierRequest): Promise<Dossier> {
  const failures: { step: string; detail: string }[] = [];
  const record = (step: string, error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    logger.warn('[Dossier] step failed', { step, detail });
    failures.push({ step, detail });
  };

  // 1. RTR
  const activiteit = (await dsoService.getActiviteit(req.urn, req.datum, req.env)) as {
    omschrijving?: string;
    bestuursorgaan?: { oin?: string; organisatieType?: string; organisatieCode?: string };
    regelBeheerObjecten?: RegelBeheerObject[];
  };

  const bo = activiteit.bestuursorgaan ?? {};
  const derivedCode = bevoegdGezagCode(bo);
  const isNational = derivedCode.startsWith('mnre');
  if (isNational && !req.authority) {
    throw new Error(
      `A national activity is annotated in many plans: pass an authority parameter for ${req.urn}`
    );
  }
  const gezagCode = req.authority ?? derivedCode;

  // 2. Ozon — the authority's omgevingsplan
  let regelingIdentificatie: string | null = null;
  let regelingTitel: string | null = null;
  try {
    const regelingen = (await ozonService.zoekRegelingen({ bevoegdGezag: [gezagCode] }, req.env, {
      size: 100,
    })) as { _embedded?: { regelingen?: { identificatie: string; type?: { code: string }; officieleTitel?: string }[] } };
    const plan = (regelingen._embedded?.regelingen ?? []).find(
      (r) => r.type?.code === OMGEVINGSPLAN_TYPE
    );
    if (plan) {
      regelingIdentificatie = plan.identificatie;
      regelingTitel = plan.officieleTitel ?? null;
    } else {
      record('regeling', new Error(`No omgevingsplan (regelingtype_003) for ${gezagCode}`));
    }
  } catch (error) {
    record('regeling', error);
  }

  // 3. Ozon — the annotation graph, joined on activiteitRef
  let annotaties: OzonAnnotaties | null = null;
  if (regelingIdentificatie) {
    try {
      annotaties = await ozonService.getRegeltekstAnnotaties(regelingIdentificatie, req.env, {
        geldigOp: req.datum,
      });
    } catch (error) {
      record('annotaties', error);
    }
  }

  const regeltekstById = new Map((annotaties?.regelteksten ?? []).map((r) => [r.identificatie, r]));
  const locatieById = new Map((annotaties?.locaties ?? []).map((l) => [l.identificatie, l]));
  const activiteitRecord = (annotaties?.activiteiten ?? []).find((a) => a.identificatie === req.urn);

  const hits = (annotaties?.regelsVoorIedereen ?? []).filter((j) =>
    (j.activiteitLocatieaanduidingen ?? []).some((a) => a.activiteitRef === req.urn)
  );

  const juridischeRegels: JuridischeRegelEntry[] = hits.map((j) => {
    const aanduiding = (j.activiteitLocatieaanduidingen ?? []).find(
      (a) => a.activiteitRef === req.urn
    );
    const regeltekst = regeltekstById.get(j.regeltekstRef);
    return {
      identificatie: j.identificatie,
      kwalificatie: aanduiding?.activiteitregelkwalificatie?.waarde ?? null,
      idealisatie: j.idealisatie?.waarde ?? null,
      regeltekstRef: j.regeltekstRef,
      wId: regeltekst?.wId ?? null,
      locaties: (aanduiding?.locatieRefs ?? []).map((ref) => {
        const loc = locatieById.get(ref);
        return { identificatie: ref, naam: loc?.naam ?? loc?.noemer ?? null };
      }),
      articleText: null,
    };
  });

  // 4. Ozon — article text per distinct wId
  if (regelingIdentificatie) {
    const wIds = [...new Set(juridischeRegels.map((r) => r.wId).filter((w): w is string => !!w))];
    const texts = await Promise.allSettled(
      wIds.map(async (wId) => {
        const component = (await ozonService.getDocumentComponent(
          regelingIdentificatie as string,
          wId,
          req.env
        )) as { _embedded?: { documentComponenten?: { inhoud?: string }[] } };
        return { wId, inhoud: component._embedded?.documentComponenten?.[0]?.inhoud ?? null };
      })
    );
    const byWId = new Map<string, string | null>();
    texts.forEach((t) => {
      if (t.status === 'fulfilled') byWId.set(t.value.wId, t.value.inhoud);
      else record('documentComponent', t.reason);
    });
    juridischeRegels.forEach((r) => {
      if (r.wId) r.articleText = byWId.get(r.wId) ?? null;
    });
  }

  // 5 + 6. Uitvoeren Gegevens — rule metadata, then the DMN the profile measures
  const rbos = activiteit.regelBeheerObjecten ?? [];
  const ruleSets = await Promise.allSettled(
    rbos.map(async (rbo) => {
      const regels = (await dsoService.getToepasbareRegels(
        rbo.functioneleStructuurRef,
        req.env
      )) as {
        _embedded?: {
          toepasbareRegels?: { identifier: number; sttrVersie?: number; begindatum?: string }[];
        };
      };
      const first = regels._embedded?.toepasbareRegels?.[0];
      if (!first) return null;

      // The same two calls the `/toepasbare-regels/:id/dmn` route makes, in
      // process. `extractDmnFromSttr` is synchronous and takes the STTR XML,
      // not an id — and it applies `normalizeDmnForOperaton`, which is why the
      // quality profile must handle underscore-separated GUIDs.
      let dmn: string | null = null;
      try {
        const sttr = await dsoService.getSttrBestand(String(first.identifier), req.env);
        dmn = dsoService.extractDmnFromSttr(sttr);
      } catch (error) {
        record('dmn', error);
      }

      const set: RuleSet = {
        typering: rbo.typering as 'Conclusie' | 'Indieningsvereisten',
        identifier: first.identifier,
        sttrVersie: first.sttrVersie ?? null,
        begindatum: first.begindatum ?? null,
        toestemming: rbo.toestemming?.waarde ?? null,
        functioneleStructuurRef: rbo.functioneleStructuurRef,
        viewerUrl: viewerUrl(rbo.functioneleStructuurRef),
        dmn,
      };
      return set;
    })
  );

  const resolved: RuleSet[] = [];
  ruleSets.forEach((r) => {
    if (r.status === 'fulfilled' && r.value) resolved.push(r.value);
    else if (r.status === 'rejected') record('toepasbareRegels', r.reason);
  });

  return {
    urn: req.urn,
    omschrijving: activiteit.omschrijving ?? null,
    bestuursorgaan: { code: gezagCode, oin: bo.oin ?? null },
    legalSource: {
      available: regelingIdentificatie !== null,
      regelingIdentificatie,
      regelingTitel,
      juridischeRegels,
    },
    annotation: {
      identificatie: activiteitRecord?.identificatie ?? null,
      naam: activiteitRecord?.naam ?? null,
      groep: activiteitRecord?.groep?.waarde ?? null,
      symboolcode: activiteitRecord?.symboolcodes?.vlak ?? null,
      bovenliggendeActiviteitRef: activiteitRecord?.bovenliggendeActiviteitRef ?? null,
    },
    decisionCriteria: resolved.find((r) => r.typering === 'Conclusie') ?? null,
    submissionRequirements: resolved.find((r) => r.typering === 'Indieningsvereisten') ?? null,
    provenance: {
      env: req.env,
      datum: req.datum ?? null,
      regelingIdentificatie,
      fetchedAt: new Date().toISOString(),
      failures,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --config packages/backend/jest.config.js src/services/dossier.service --coverage=false`
Expected: PASS — 12 tests

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/services/dossier.service.ts packages/backend/src/services/dossier.service.test.ts packages/backend/src/__fixtures__/annotaties-gm0995-prod.json
git commit -m "feat(dso): assemble an activity's legal source, annotation and rule sets"
```

---

### Task 7: `quality.service.ts` — the quality profile

**Files:**
- Create: `packages/backend/src/services/quality.service.ts`
- Test: `packages/backend/src/services/quality.service.test.ts`

**Interfaces:**
- Consumes: the `Dossier` type from Task 6.
- Produces: `profileDossier(d: Dossier): QualityProfile`, `classifyName(name: string, resolvable: boolean): IdClass`, `measureDmn(xml: string): DmnNamingStats`, `GUID_RE`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/backend/src/services/quality.service.test.ts
import { profileDossier, classifyName, measureDmn, GUID_RE } from './quality.service';
import type { Dossier } from './dossier.service';

describe('GUID detection', () => {
  test('matches a hyphen-separated GUID', () => {
    expect(GUID_RE.test('_6d45be8c-8010-4d11-8775-487a28b88087_Vergunningplicht')).toBe(true);
  });

  // normalizeDmnForOperaton rewrites hyphens to underscores to make names
  // FEEL-safe; a hyphen-only detector reports 0% opacity on an opaque DMN.
  test('matches an underscore-separated GUID', () => {
    expect(GUID_RE.test('onderwerp_c7ef02b1_0f07_4ec7_a91e_6a6c35dd3922')).toBe(true);
  });

  test('does not match an ordinary name', () => {
    expect(GUID_RE.test('Boom kappen of houtopstand vellen')).toBe(false);
  });
});

describe('classifyName', () => {
  test('a meaningful name is semantic', () => {
    expect(classifyName('Boom kappen of houtopstand vellen', false)).toBe('semantic');
  });

  test('a GUID name with a resolution path is opaque-resolvable', () => {
    expect(classifyName('uitv__864933e7-4ea9-45a2-ae17-d8b1a4df34d7', true)).toBe(
      'opaque-resolvable'
    );
  });

  test('a GUID name with no resolution path is opaque-dangling', () => {
    expect(classifyName('_6d45be8c-8010-4d11-8775-487a28b88087_Niet van toepassing', false)).toBe(
      'opaque-dangling'
    );
  });
});

describe('measureDmn', () => {
  const dmn = `<?xml version="1.0"?>
<dmn:definitions xmlns:dmn="https://www.omg.org/spec/DMN/20191111/MODEL/" xmlns:uitv="x">
  <dmn:decision id="d1" name="Boom kappen of houtopstand vellen"/>
  <dmn:decision id="d2" name="_6d45be8c-8010-4d11-8775-487a28b88087_Vergunningplicht"/>
  <dmn:decisionTable id="t1"/>
  <dmn:inputData id="i1" name="uitv__864933e7-4ea9-45a2-ae17-d8b1a4df34d7"/>
  <dmn:inputData id="i2" name="onderwerp_c7ef02b1_0f07_4ec7_a91e_6a6c35dd3922"/>
  <uitv:vraagTekst><![CDATA[Wilt u een boom of beplanting weghalen?]]></uitv:vraagTekst>
</dmn:definitions>`;

  test('counts decisions without counting decisionTable', () => {
    expect(measureDmn(dmn).decisions.total).toBe(2);
  });

  test('splits decisions into semantic and opaque', () => {
    const m = measureDmn(dmn);
    expect(m.decisions.semantic).toBe(1);
    expect(m.decisions.opaque).toBe(1);
  });

  test('counts both GUID separators as opaque inputs', () => {
    expect(measureDmn(dmn).inputs.opaque).toBe(2);
  });

  // A naive `<[^>]+>` strip eats CDATA and scores label coverage as zero.
  test('reads question text out of CDATA', () => {
    expect(measureDmn(dmn).questions).toEqual(['Wilt u een boom of beplanting weghalen?']);
  });

  test('collects embedded IMOW refs', () => {
    const withRef = dmn.replace(
      '<uitv:vraagTekst>',
      '<dmn:text>nl.imow-gm0995.gebiedengroep.180a63f795be43bf8683a480e75deb84</dmn:text><uitv:vraagTekst>'
    );
    expect(measureDmn(withRef).imowRefs).toEqual([
      'nl.imow-gm0995.gebiedengroep.180a63f795be43bf8683a480e75deb84',
    ]);
  });
});

describe('profileDossier', () => {
  const dossier = {
    urn: 'nl.imow-gm0995.activiteit.HoutopstandVellen',
    legalSource: {
      available: true,
      juridischeRegels: Array.from({ length: 10 }, (_, i) => ({
        wId: `w${i}`,
        articleText: i < 8 ? '<Inhoud/>' : null,
        locaties: [
          { identificatie: 'nl.imow-gm0995.gebiedengroep.180a63f795be43bf8683a480e75deb84', naam: 'bebouwingscontour, houtkap' },
        ],
      })),
    },
    annotation: { groep: 'kapactiviteit' },
    decisionCriteria: {
      // Carries the gebiedengroep ref so refResolvability has something to resolve —
      // the dossier resolved that same identificatie to a name above.
      dmn:
        '<dmn:definitions xmlns:dmn="x"><dmn:decision id="d" name="Boom kappen"/>' +
        '<dmn:text>nl.imow-gm0995.gebiedengroep.180a63f795be43bf8683a480e75deb84</dmn:text>' +
        '</dmn:definitions>',
    },
    submissionRequirements: null,
  } as unknown as Dossier;

  test('classifies a semantic activity URN', () => {
    expect(profileDossier(dossier).activityIdentity).toBe('semantic');
  });

  test('reports legal traceability as traced over total', () => {
    const p = profileDossier(dossier);
    expect(p.legalTraceability).toEqual({ rules: 10, withWId: 10, withArticleText: 8 });
  });

  test('counts a resolved IMOW ref as resolvable', () => {
    expect(profileDossier(dossier).refResolvability.resolved).toBe(1);
  });

  test('produces no single headline grade', () => {
    const p = profileDossier(dossier) as unknown as Record<string, unknown>;
    expect(p['grade']).toBeUndefined();
    expect(p['score']).toBeUndefined();
  });

  test('an opaque URN local name is classified opaque', () => {
    const opaque = {
      ...dossier,
      urn: 'nl.imow-gm0995.activiteit.180a63f7-95be-43bf-8683-a480e75deb84',
    } as Dossier;
    expect(profileDossier(opaque).activityIdentity).not.toBe('semantic');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config packages/backend/jest.config.js src/services/quality.service --coverage=false`
Expected: FAIL — `Cannot find module './quality.service'`

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/backend/src/services/quality.service.ts

/**
 * Scores how legible an activity's chain is.
 *
 * Two axes, never one number: LEGIBILITY (readable as it stands?) and
 * RECOVERABILITY (if not, can the dossier resolve it, and from where?).
 * A single headline grade is deliberately not produced — the profile exists
 * to compare activities and municipalities, and a grade flattens exactly the
 * differences being compared.
 *
 * Pure: no I/O, so it is trivially testable and the scoring rules live in one
 * readable place.
 */

import type { Dossier } from './dossier.service';

/**
 * A GUID with EITHER separator. `normalizeDmnForOperaton` rewrites hyphens to
 * underscores to make names FEEL-safe, so a hyphen-only detector reports 0%
 * opacity on a DMN that is in fact mostly opaque.
 */
const H = '[0-9a-f]';
export const GUID_RE = new RegExp(`${H}{8}[-_]${H}{4}[-_]${H}{4}[-_]${H}{4}[-_]${H}{12}`, 'i');

export type IdClass = 'semantic' | 'opaque-resolvable' | 'opaque-dangling';

export function classifyName(name: string, resolvable: boolean): IdClass {
  if (!GUID_RE.test(name)) return 'semantic';
  return resolvable ? 'opaque-resolvable' : 'opaque-dangling';
}

export interface NamingSplit {
  total: number;
  semantic: number;
  opaque: number;
}

export interface DmnNamingStats {
  decisions: NamingSplit;
  inputs: NamingSplit;
  questions: string[];
  imowRefs: string[];
}

function openTags(xml: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<dmn:${tag}\\s`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const end = xml.indexOf('>', m.index);
    if (end === -1) continue;
    const open = xml.slice(m.index, end + 1);
    // `<dmn:decisionTable` also starts with `<dmn:decision`
    if (open.slice(1).split(/[\s>]/)[0] !== `dmn:${tag}`) continue;
    out.push(open);
  }
  return out;
}

function split(names: string[]): NamingSplit {
  const opaque = names.filter((n) => GUID_RE.test(n)).length;
  return { total: names.length, semantic: names.length - opaque, opaque };
}

export function measureDmn(xml: string): DmnNamingStats {
  const nameOf = (open: string) => (open.match(/\bname="([^"]*)"/) || [])[1] ?? '';
  const decisions = openTags(xml, 'decision').map(nameOf);
  const inputs = openTags(xml, 'inputData').map(nameOf);

  // vraagTekst content is CDATA — a `<[^>]+>` strip would eat it.
  const questions = [...xml.matchAll(/<uitv:vraagTekst[^>]*>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/uitv:vraagTekst>/g)]
    .map((m) => m[1]?.trim() ?? '')
    .filter(Boolean);

  const imowRefs = [
    ...new Set([...xml.matchAll(/nl\.imow-[a-z0-9]+\.[a-zA-Z]+\.[0-9a-f]{6,}/g)].map((m) => m[0])),
  ];

  return { decisions: split(decisions), inputs: split(inputs), questions, imowRefs };
}

export interface QualityProfile {
  urn: string;
  activityIdentity: IdClass;
  decisionNaming: NamingSplit | null;
  inputNaming: NamingSplit | null;
  labelCoverage: { inputs: number; withQuestion: number } | null;
  refResolvability: { total: number; resolved: number; dangling: number };
  legalTraceability: { rules: number; withWId: number; withArticleText: number };
  crossLayerConsistency: { sharedObjects: string[] };
}

export function profileDossier(d: Dossier): QualityProfile {
  const localName = d.urn.split('.').slice(3).join('.') || d.urn;
  const activityIdentity = classifyName(localName, true);

  const dmn = d.decisionCriteria?.dmn ?? null;
  const measured = dmn ? measureDmn(dmn) : null;

  // Every locatie the dossier resolved to a readable name.
  const resolvedRefs = new Set(
    (d.legalSource?.juridischeRegels ?? [])
      .flatMap((r) => r.locaties)
      .filter((l) => l.naam !== null)
      .map((l) => l.identificatie)
  );

  const dmnRefs = measured?.imowRefs ?? [];
  const resolved = dmnRefs.filter((ref) => resolvedRefs.has(ref));
  const dangling = dmnRefs.filter((ref) => !resolvedRefs.has(ref));

  const rules = d.legalSource?.juridischeRegels ?? [];

  return {
    urn: d.urn,
    activityIdentity,
    decisionNaming: measured?.decisions ?? null,
    inputNaming: measured?.inputs ?? null,
    labelCoverage: measured
      ? { inputs: measured.inputs.total, withQuestion: measured.questions.length }
      : null,
    refResolvability: { total: dmnRefs.length, resolved: resolved.length, dangling: dangling.length },
    legalTraceability: {
      rules: rules.length,
      withWId: rules.filter((r) => r.wId !== null).length,
      withArticleText: rules.filter((r) => r.articleText !== null).length,
    },
    crossLayerConsistency: { sharedObjects: resolved },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --config packages/backend/jest.config.js src/services/quality.service --coverage=false`
Expected: PASS — 15 tests

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/services/quality.service.ts packages/backend/src/services/quality.service.test.ts
git commit -m "feat(dso): score an activity's legibility and recoverability"
```

---

### Task 8: The composite dossier route

**Files:**
- Modify: `packages/backend/src/routes/dso.routes.ts`
- Modify: `packages/backend/src/routes/dso.routes.test.ts`
- Modify: `packages/backend/openapi/`

**Interfaces:**
- Consumes: `buildDossier` (Task 6), `profileDossier` (Task 7).
- Produces: `GET /v1/dso/activiteiten/:urn/dossier?env=&datum=&authority=` returning `{ success, data: { ...Dossier, qualityProfile } }`.

**Route ordering matters:** Express matches in declaration order, and `/activiteiten/:urn` already exists. Declare `/activiteiten/:urn/dossier` **before** it, or the detail route swallows the path.

- [ ] **Step 1: Write the failing test**

Add to the `jest.mock` list in `dso.routes.test.ts`:

```ts
jest.mock('../services/dossier.service', () => ({
  __esModule: true,
  buildDossier: jest.fn(),
}));
jest.mock('../services/quality.service', () => ({
  __esModule: true,
  profileDossier: jest.fn(),
}));
```

with matching imports:

```ts
import * as dossierService from '../services/dossier.service';
import * as qualityService from '../services/quality.service';
const dossier = dossierService as unknown as Record<string, jest.Mock>;
const quality = qualityService as unknown as Record<string, jest.Mock>;
```

Then append:

```ts
describe('GET /v1/dso/activiteiten/:urn/dossier', () => {
  const URN = 'nl.imow-gm0995.activiteit.HoutopstandVellen';

  beforeEach(() => {
    dossier.buildDossier.mockReset();
    quality.profileDossier.mockReset();
    dossier.buildDossier.mockResolvedValue({ urn: URN, provenance: { env: 'prod' } });
    quality.profileDossier.mockReturnValue({ urn: URN, activityIdentity: 'semantic' });
  });

  test('returns the dossier with its quality profile attached', async () => {
    const res = await request(makeApp())
      .get(`/v1/dso/activiteiten/${URN}/dossier`)
      .set('X-Dso-Env', 'prod');

    expect(res.status).toBe(200);
    expect(res.body.data.urn).toBe(URN);
    expect(res.body.data.qualityProfile.activityIdentity).toBe('semantic');
  });

  test('passes env, datum and authority through', async () => {
    await request(makeApp())
      .get(`/v1/dso/activiteiten/${URN}/dossier?datum=22-09-2026&authority=gm0995`)
      .set('X-Dso-Env', 'prod');

    expect(dossier.buildDossier).toHaveBeenCalledWith({
      urn: URN,
      env: 'prod',
      datum: '22-09-2026',
      authority: 'gm0995',
    });
  });

  test('does not collide with the activity detail route', async () => {
    svc.getActiviteit.mockResolvedValue({ urn: URN });

    await request(makeApp()).get(`/v1/dso/activiteiten/${URN}/dossier`);

    expect(svc.getActiviteit).not.toHaveBeenCalled();
    expect(dossier.buildDossier).toHaveBeenCalled();
  });

  test('a missing authority for a national activity answers 400', async () => {
    dossier.buildDossier.mockRejectedValue(
      new Error('A national activity is annotated in many plans: pass an authority parameter')
    );

    const res = await request(makeApp()).get('/v1/dso/activiteiten/nl.imow-mnre1034.activiteit.X/dossier');

    expect(res.status).toBe(400);
  });

  test('an upstream failure answers 502', async () => {
    dossier.buildDossier.mockRejectedValue(new Error('DSO responded 500: boom'));

    const res = await request(makeApp()).get(`/v1/dso/activiteiten/${URN}/dossier`);

    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config packages/backend/jest.config.js src/routes/dso.routes --coverage=false -t "dossier"`
Expected: FAIL — the detail route answers instead, `buildDossier` never called

- [ ] **Step 3: Write minimal implementation**

Add the imports to `dso.routes.ts`:

```ts
import { buildDossier } from '../services/dossier.service';
import { profileDossier } from '../services/quality.service';
```

Insert this **above** the existing `router.get('/activiteiten/:urn', …)` declaration:

```ts
/**
 * GET /v1/dso/activiteiten/:urn/dossier
 * The full chain: legal source, annotation, decision criteria, submission
 * requirements, plus the quality profile.
 *
 * Declared before `/activiteiten/:urn` — Express matches in declaration order,
 * and the detail route would otherwise swallow this path.
 */
router.get('/activiteiten/:urn/dossier', async (req: Request, res: Response) => {
  res.set('API-Version', packageJson.version);
  try {
    const datum = typeof req.query['datum'] === 'string' ? req.query['datum'] : undefined;
    const authority =
      typeof req.query['authority'] === 'string' ? req.query['authority'] : undefined;

    const data = await buildDossier({
      urn: req.params['urn'] as string,
      env: getEnv(req),
      datum,
      authority,
    });

    res.status(200).json({ success: true, data: { ...data, qualityProfile: profileDossier(data) } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'DSO request failed';
    logger.error('[DSO Routes] GET /activiteiten/:urn/dossier failed', { error: msg });
    const status = msg.includes('authority') ? 400 : msg.includes('404') ? 404 : 502;
    sendProblem(res, req, {
      status,
      title:
        status === 400 ? 'Invalid request' : status === 404 ? 'Not found' : 'Upstream request failed',
      detail: msg,
    });
  }
});
```

Add `/dso/activiteiten/{urn}/dossier` to `packages/backend/openapi/openapi.yaml`, next to
the `/dso/activiteiten/{urn}` entry (around line 3735): `get`,
`operationId: getDsoActiviteitDossier`, `tags: [Integrations]`, path param `urn`, query
params `datum` and `authority`, responses `200` (`{ success, data }` where `data` carries
the dossier plus `qualityProfile`), `400`, `404`, `502` referencing the same
problem-details component the other `/dso/*` entries use. Do not hand-edit
`openapi.json` — `npm run build:openapi` regenerates it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build:openapi --workspace=@linked-data-explorer/backend && npx jest --config packages/backend/jest.config.js src/routes src/openapi --coverage=false`
Expected: PASS — the 5 new tests, every pre-existing route test, and the OpenAPI conformance suite

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/dso.routes.ts packages/backend/src/routes/dso.routes.test.ts packages/backend/openapi
git commit -m "feat(dso): expose the activity dossier with its quality profile"
```

---

### Task 9: The `dso:dossier` script

**Files:**
- Create: `scripts/dso-dossier.mjs`
- Modify: `package.json` (root `scripts`)
- Test: `scripts/dso-dossier.test.mjs`

**Interfaces:**
- Consumes: the dossier route from Task 8 over HTTP.
- Produces: `renderDossier(data): string`, exported for test; CLI entry when run directly.

**Constraint:** the script never starts, stops or restarts a server. If the backend is unreachable it prints the expected base URL and exits non-zero.

- [ ] **Step 1: Write the failing test**

```js
// scripts/dso-dossier.test.mjs
import { renderDossier } from './dso-dossier.mjs';

const data = {
  urn: 'nl.imow-gm0995.activiteit.HoutopstandVellen',
  omschrijving: 'Boom kappen of houtopstand vellen',
  bestuursorgaan: { code: 'gm0995', oin: '00000001005024249000' },
  legalSource: {
    available: true,
    regelingTitel: 'Omgevingsplan gemeente Lelystad',
    juridischeRegels: [
      {
        identificatie: 'nl.imow-gm0995.juridischeregel.1',
        kwalificatie: 'vergunningplicht',
        wId: 'gm0995_x__art_15.2__para_5',
        locaties: [{ identificatie: 'nl.imow-gm0995.gebiedengroep.180a', naam: 'bebouwingscontour, houtkap' }],
        articleText: '<Inhoud><Al>Het is verboden zonder omgevingsvergunning…</Al></Inhoud>',
      },
    ],
  },
  annotation: { groep: 'kapactiviteit', bovenliggendeActiviteitRef: 'nl.imow-gm0995.activiteit.OverigeAct' },
  decisionCriteria: {
    identifier: 114233,
    sttrVersie: 2,
    begindatum: '30-07-2026',
    viewerUrl: 'https://omgevingswet.overheid.nl/registratie-toepasbare-regels/id/Conclusiex',
  },
  submissionRequirements: null,
  qualityProfile: {
    activityIdentity: 'semantic',
    decisionNaming: { total: 7, semantic: 3, opaque: 4 },
    inputNaming: { total: 5, semantic: 0, opaque: 5 },
    labelCoverage: { inputs: 5, withQuestion: 5 },
    refResolvability: { total: 1, resolved: 1, dangling: 0 },
    legalTraceability: { rules: 10, withWId: 10, withArticleText: 10 },
  },
  provenance: { env: 'prod', datum: '22-09-2026', fetchedAt: '2026-09-22T14:00:00Z', failures: [] },
};

const md = renderDossier(data);

const checks = [
  ['stamps the environment', md.includes('**Environment:** prod')],
  ['stamps the date', md.includes('22-09-2026')],
  ['names the activity', md.includes('Boom kappen of houtopstand vellen')],
  ['renders article text without XML tags', md.includes('Het is verboden zonder omgevingsvergunning') && !md.includes('<Al>')],
  ['shows the viewer link', md.includes('registratie-toepasbare-regels')],
  ['reports the naming split', md.includes('3') && md.includes('4')],
  ['marks an absent rule set', md.includes('Not present')],
  ['resolves the locatie name', md.includes('bebouwingscontour, houtkap')],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) { console.error('FAIL:', name); failed++; }
}
if (failed) process.exit(1);
console.log(`PASS: ${checks.length} checks`);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/dso-dossier.test.mjs`
Expected: FAIL — `Cannot find module` for `./dso-dossier.mjs`

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/dso-dossier.mjs
// Renders an activity dossier to Markdown.
//
// Usage: npm run dso:dossier -- --urn=<urn> [--env=prod] [--date=YYYY-MM-DD] [--out=<path>]
//
// Requires an already-running backend. This script never starts, stops or
// restarts a server.

import fs from 'node:fs';

const BASE = process.env.LDE_API_BASE_URL ?? 'http://localhost:3001';

/** STOP/IMOP content to readable text. */
function plainText(xml) {
  if (!xml) return '';
  return xml
    .replace(/<LiNummer>([\s\S]*?)<\/LiNummer>/g, '$1 ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pct(part, total) {
  return total ? `${Math.round((100 * part) / total)}%` : 'n/a';
}

function renderRuleSet(title, set) {
  if (!set) return `### ${title}\n\nNot present for this activity.\n`;
  return [
    `### ${title}`,
    '',
    `- **Toepasbare regel:** \`${set.identifier}\` (STTR v${set.sttrVersie ?? '?'}, vanaf ${set.begindatum ?? '?'})`,
    set.toestemming ? `- **Toestemming:** ${set.toestemming}` : null,
    `- **Viewer:** ${set.viewerUrl}`,
    '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function renderDossier(d) {
  const q = d.qualityProfile ?? {};
  const rules = d.legalSource?.juridischeRegels ?? [];

  const lines = [
    `# ${d.omschrijving ?? d.urn}`,
    '',
    `**URN:** \`${d.urn}\`  `,
    `**Authority:** ${d.bestuursorgaan?.code ?? '?'} (OIN ${d.bestuursorgaan?.oin ?? '?'})  `,
    `**Environment:** ${d.provenance?.env}  `,
    `**Valid on:** ${d.provenance?.datum ?? 'today'}  `,
    `**Retrieved:** ${d.provenance?.fetchedAt}`,
    '',
    '> Environment and date are part of the result: the same activity differs',
    '> between pre-production and production, and rule ids do not carry across.',
    '',
    '## 1. Legal source',
    '',
  ];

  if (!d.legalSource?.available) {
    lines.push('No omgevingsplan was found for this authority.', '');
  } else {
    lines.push(`Regeling: **${d.legalSource.regelingTitel ?? d.legalSource.regelingIdentificatie}**`, '');
    lines.push(`${rules.length} juridische regels reference this activity.`, '');
    for (const r of rules) {
      lines.push(`#### ${r.wId ?? r.identificatie}`, '');
      lines.push(`- **Kwalificatie:** ${r.kwalificatie ?? '—'}`);
      const locs = r.locaties.map((l) => `${l.naam ?? l.identificatie}`).join(', ');
      lines.push(`- **Werkingsgebied:** ${locs || '—'}`);
      if (r.articleText) lines.push('', `> ${plainText(r.articleText)}`);
      lines.push('');
    }
  }

  lines.push('## 2. Annotation', '');
  lines.push(`- **Groep:** ${d.annotation?.groep ?? '—'}`);
  lines.push(`- **Parent activity:** \`${d.annotation?.bovenliggendeActiviteitRef ?? '—'}\``);
  lines.push('');

  lines.push('## 3. Decision criteria', '');
  lines.push(renderRuleSet('Conclusie', d.decisionCriteria));
  lines.push('## 4. Submission requirements', '');
  lines.push(renderRuleSet('Indieningsvereisten', d.submissionRequirements));

  lines.push('## Quality profile', '');
  lines.push('Two axes: how much is readable as it stands, and how much the dossier had to recover.', '');
  lines.push('| Dimension | Value |', '|---|---|');
  lines.push(`| Activity identity | ${q.activityIdentity ?? '—'} |`);
  if (q.decisionNaming)
    lines.push(
      `| Decision naming | ${q.decisionNaming.semantic}/${q.decisionNaming.total} semantic, ${q.decisionNaming.opaque} opaque (${pct(q.decisionNaming.opaque, q.decisionNaming.total)}) |`
    );
  if (q.inputNaming)
    lines.push(
      `| Input naming | ${q.inputNaming.semantic}/${q.inputNaming.total} semantic, ${q.inputNaming.opaque} opaque (${pct(q.inputNaming.opaque, q.inputNaming.total)}) |`
    );
  if (q.labelCoverage)
    lines.push(`| Label coverage | ${q.labelCoverage.withQuestion}/${q.labelCoverage.inputs} inputs carry a question |`);
  if (q.refResolvability)
    lines.push(`| Ref resolvability | ${q.refResolvability.resolved} resolved, ${q.refResolvability.dangling} dangling |`);
  if (q.legalTraceability)
    lines.push(
      `| Legal traceability | ${q.legalTraceability.withArticleText}/${q.legalTraceability.rules} rules traced to article text |`
    );
  lines.push('');

  const failures = d.provenance?.failures ?? [];
  if (failures.length) {
    lines.push('## Incomplete legs', '');
    for (const f of failures) lines.push(`- **${f.step}:** ${f.detail}`);
    lines.push('');
  }

  return lines.join('\n');
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, ...rest] = a.replace(/^--/, '').split('=');
      return [k, rest.join('=')];
    })
  );

  if (!args.urn) {
    console.error('Usage: npm run dso:dossier -- --urn=<urn> [--env=prod] [--date=YYYY-MM-DD] [--out=<path>]');
    process.exit(2);
  }

  const params = new URLSearchParams();
  if (args.date) params.set('datum', args.date);
  if (args.authority) params.set('authority', args.authority);
  const url = `${BASE}/v1/dso/activiteiten/${encodeURIComponent(args.urn)}/dossier?${params}`;

  let res;
  try {
    res = await fetch(url, { headers: { 'X-Dso-Env': args.env === 'prod' ? 'prod' : 'pre' } });
  } catch {
    console.error(
      `Cannot reach the LDE backend at ${BASE}. Start it yourself, or set LDE_API_BASE_URL. This script does not manage servers.`
    );
    process.exit(1);
  }

  if (!res.ok) {
    console.error(`Backend answered ${res.status}: ${await res.text()}`);
    process.exit(1);
  }

  const { data } = await res.json();
  const md = renderDossier(data);

  if (args.out) {
    fs.writeFileSync(args.out, md, 'utf8');
    console.log(`Written to ${args.out}`);
  } else {
    console.log(md);
  }
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  await main();
}
```

Add to the root `package.json` `scripts`:

```json
    "dso:dossier": "node scripts/dso-dossier.mjs",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/dso-dossier.test.mjs`
Expected: PASS — 8 checks

- [ ] **Step 5: Commit**

```bash
git add scripts/dso-dossier.mjs scripts/dso-dossier.test.mjs package.json
git commit -m "feat(dso): render an activity dossier and its quality profile to Markdown"
```

---

### Task 10: Method doc and worked example

**Files:**
- Create: `docs/dso-activity-dossier.md`
- Create: `docs/examples/dossier-houtopstandvellen-gm0995.md`

**Interfaces:**
- Consumes: the script from Task 9.
- Produces: documentation only.

- [ ] **Step 1: Generate the worked example**

The backend must already be running — do not start it. Run:

```bash
npm run dso:dossier -- --urn=nl.imow-gm0995.activiteit.HoutopstandVellen --env=prod --out=docs/examples/dossier-houtopstandvellen-gm0995.md
```

- [ ] **Step 2: Verify the output against the spec's verified figures**

Check the generated file states: 10 juridische regels, 5 `vergunningplicht`, Conclusie `114233` STTR v2, Indieningsvereisten `105947`, groep `kapactiviteit`, and "bebouwingscontour, houtkap" as a resolved werkingsgebied. If any differ, DSO has changed since 2026-09-22 — record the new values in the example and note the date, rather than editing the file to match the spec.

- [ ] **Step 3: Write the method doc**

Create `docs/dso-activity-dossier.md` covering, each as its own section:

1. **The four links** and which API serves each — RTR, Ozon Presenteren v8, Uitvoeren Gegevens — with the worked example's figures.
2. **The joins**, written out: `bestuursorgaan` → `gm0995` → regelingtype_003; `regelsVoorIedereen[].activiteitLocatieaanduidingen[].activiteitRef` → `regeltekstRef` → `wId` → article text; `functioneleStructuurRef` → rule id → DMN.
3. **Running it** — the `dso:dossier` command, its flags, and that it needs a backend the reader starts themselves.
4. **Quirks**, copied from the spec's section: the underscore transform, the full-OGC `Content-Crs`, the non-HAL annotations shape, the join living on `regelsVoorIedereen`, v7/v8 error dialects, both GUID separators, CDATA question text.
5. **Generalisation** — another municipality is a different URN prefix (`pv`/`ws`/`mnre` all derive the same way); another activity is a different URN. National (`mnre`) activities need `--authority`.
6. **Edge cases** — empty `regelBeheerObjecten`; authorities with no omgevingsplan; tijdelijke delen being out of scope and why.
7. **Environment and date are part of the answer** — rule ids are env-specific and collide silently; state the 114233/85149 example.

- [ ] **Step 4: Verify the docs build**

Run: `npm run lint --workspace=@linked-data-explorer/backend`
Expected: PASS (no lint rules cover `docs/`, so this confirms nothing else broke)

- [ ] **Step 5: Commit**

```bash
git add docs/dso-activity-dossier.md docs/examples/dossier-houtopstandvellen-gm0995.md
git commit -m "docs(dso): document the activity dossier method and its worked example"
```

---

## Final verification

- [ ] **Full backend suite:** `npm test --workspace=@linked-data-explorer/backend`
  Expected: PASS. If a test fails only here and not in isolation, re-run that file alone before drawing any conclusion — a parallel-only failure is not a finding.
- [ ] **Typecheck:** `npm run typecheck --workspace=@linked-data-explorer/backend` — Expected: PASS
- [ ] **Lint:** `npm run lint --workspace=@linked-data-explorer/backend` — Expected: PASS
- [ ] **OpenAPI lint:** `npm run lint:openapi --workspace=@linked-data-explorer/backend` — Expected: PASS
- [ ] **Ask the user to confirm the DSO Explorer still behaves correctly** — activity detail is now cached, so ask them to open an activity with children, navigate into a child and back, and confirm names still appear. Do not drive a browser to check this.

## Follow-ups deliberately not in this plan

- A concurrency cap on the child-activity fan-out. Caching removes the repeat cost but not the cold `1 + N` burst.
- Migrating `sparql.service.ts` onto `utils/ttl-cache.ts`.
- A UI panel rendering the dossier. The dossier object is shaped to make one cheap.
- Persisting the indexed annotation graph, should dossiers ever be generated in bulk.
