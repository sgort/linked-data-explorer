// Covers the content-negotiated root handler. The registry is mocked with a
// small synthetic topology so the assertions describe rootViews' own behaviour
// (grouping, ordering, escaping, negotiation) rather than tracking whatever the
// real route list happens to contain today.

import express from 'express';
import request from 'supertest';

jest.mock('./config', () => ({
  __esModule: true,
  config: { displayEnv: 'test' },
  default: { displayEnv: 'test' },
}));

jest.mock('../routes/registry', () => ({
  __esModule: true,
  routeRegistry: [
    // Deliberately out of CATEGORY_ORDER order, so the ordering assertion is
    // meaningful rather than accidentally satisfied by the source order.
    {
      mount: '/v1/vendors',
      router: {},
      summary: 'Vendor <discovery> & "friends"',
      category: 'Integrations',
    },
    {
      mount: '/v1/health',
      router: {},
      summary: 'Service health',
      category: 'Health & monitoring',
    },
    {
      mount: '/v1/ropa/public',
      router: {},
      summary: 'Public RoPA records',
      category: 'Assets',
      publicCors: true,
    },
    {
      mount: '/v1/experimental',
      router: {},
      summary: 'Not in CATEGORY_ORDER',
      category: 'Sandbox',
    },
  ],
}));

import { rootHandler } from './rootViews';
import packageJson from '../../package.json';

function makeApp() {
  const app = express();
  app.get('/', rootHandler);
  return app;
}

describe('rootHandler JSON view', () => {
  test('defaults to JSON when the client sends no Accept header', async () => {
    const res = await request(makeApp()).get('/');

    expect(res.status).toBe(200);
    expect(res.type).toBe('application/json');
    expect(res.body).toMatchObject({
      name: 'Linked Data Explorer Backend',
      version: packageJson.version,
      environment: 'test',
      status: 'running',
      documentation: '/v1/openapi.json',
      health: '/v1/health',
    });
  });

  test('returns JSON for Accept: application/json', async () => {
    const res = await request(makeApp()).get('/').set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.type).toBe('application/json');
    expect(res.body.endpoints['Health & monitoring']).toEqual([
      { mount: '/v1/health', summary: 'Service health', publicCors: false },
    ]);
  });

  test('returns JSON for the wildcard Accept curl sends by default', async () => {
    const res = await request(makeApp()).get('/').set('Accept', '*/*');

    expect(res.type).toBe('application/json');
  });

  test('groups routes by category in CATEGORY_ORDER, unknown categories last', async () => {
    const res = await request(makeApp()).get('/');

    expect(Object.keys(res.body.endpoints)).toEqual([
      'Health & monitoring',
      'Assets',
      'Integrations',
      'Sandbox',
    ]);
  });

  test('drops seeded categories that have no routes', async () => {
    const res = await request(makeApp()).get('/');

    // Seeded by CATEGORY_ORDER but unused by the mocked registry.
    expect(res.body.endpoints).not.toHaveProperty('Discovery');
    expect(res.body.endpoints).not.toHaveProperty('Validation');
    expect(res.body.endpoints).not.toHaveProperty('Execution');
  });

  test('normalises publicCors to a boolean', async () => {
    const res = await request(makeApp()).get('/');

    expect(res.body.endpoints.Assets[0].publicCors).toBe(true);
    expect(res.body.endpoints.Integrations[0].publicCors).toBe(false);
  });

  test('lists the deprecated /api/* aliases so clients can find the migration path', async () => {
    const res = await request(makeApp()).get('/');

    expect(res.body.legacy).toEqual({
      health: '/api/health (deprecated)',
      dmns: '/api/dmns (deprecated)',
      cache: '/api/cache (deprecated)',
      'chains/templates': '/api/chains/templates (deprecated)',
      chains: '/api/chains (deprecated)',
      triplydb: '/api/triplydb (deprecated)',
      vendors: '/api/vendors (deprecated)',
    });
  });
});

describe('rootHandler HTML view', () => {
  async function getHtml() {
    const res = await request(makeApp())
      .get('/')
      // Chrome's default Accept header: html outranks json on q-value.
      .set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
    return res;
  }

  test('renders HTML when the client prefers text/html', async () => {
    const res = await getHtml();

    expect(res.status).toBe(200);
    expect(res.type).toBe('text/html');
    expect(res.text).toMatch(/^<!doctype html>/);
    expect(res.text).toContain('<h1>Linked Data Explorer Backend</h1>');
  });

  test('renders one section per category, with each mount as a row', async () => {
    const res = await getHtml();

    expect(res.text).toContain('<h2>Health &amp; monitoring</h2>');
    expect(res.text).toContain('<code>/v1/health</code>');
    expect(res.text).toContain('<code>/v1/vendors</code>');
    expect(res.text).toContain('<h2>Sandbox</h2>');
  });

  test('badges public open-CORS routes and leaves the others unbadged', async () => {
    const res = await getHtml();

    const ropaRow = res.text.split('\n').find((l) => l.includes('/v1/ropa/public'));
    const vendorRow = res.text.split('\n').find((l) => l.includes('/v1/vendors'));

    expect(ropaRow).toContain('public · open CORS');
    expect(vendorRow).not.toContain('public · open CORS');
  });

  test('escapes HTML metacharacters in registry-supplied strings', async () => {
    const res = await getHtml();

    expect(res.text).toContain('Vendor &lt;discovery&gt; &amp; &quot;friends&quot;');
    expect(res.text).not.toContain('Vendor <discovery>');
  });

  test('renders the legacy table with the successor path, not the deprecation suffix', async () => {
    const res = await getHtml();

    expect(res.text).toContain('<code>/api/health</code>');
    expect(res.text).toContain('replaced by <code>/v1/health</code>');
    expect(res.text).not.toContain('/api/health (deprecated)');
  });

  test('shows version and environment in the header', async () => {
    const res = await getHtml();

    expect(res.text).toContain(`<strong>${packageJson.version}</strong>`);
    expect(res.text).toContain('<strong>test</strong>');
  });
});
