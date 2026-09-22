jest.mock('../utils/logger', () => ({
  __esModule: true,
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

const configMock = {
  dso: {
    catalogueBaseUrl: 'https://pre.example/catalogus',
    rtrBaseUrl: 'https://pre.example/rtr',
    zoekinterfaceBaseUrl: 'https://pre.example/zoek',
    opvragenWerkzaamhedenBaseUrl: 'https://pre.example/werkzaamheden',
    uitvoerenGegevensBaseUrl: 'https://pre.example/uitvoeren',
    ozonBaseUrl: 'https://pre.example/ozon',
    apiKey: 'pre-key',
    timeout: 15000,
  },
  dsoProd: {
    catalogueBaseUrl: 'https://prod.example/catalogus',
    rtrBaseUrl: 'https://prod.example/rtr',
    zoekinterfaceBaseUrl: 'https://prod.example/zoek',
    opvragenWerkzaamhedenBaseUrl: 'https://prod.example/werkzaamheden',
    uitvoerenGegevensBaseUrl: 'https://prod.example/uitvoeren',
    ozonBaseUrl: 'https://prod.example/ozon',
    apiKey: 'prod-key',
  },
};
jest.mock('../utils/config', () => ({
  __esModule: true,
  config: configMock,
  default: configMock,
}));

import * as ozon from './ozon.service';

const realFetch = global.fetch;

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

  afterEach(() => {
    global.fetch = realFetch;
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
    expect(url).toContain('https://prod.example/ozon');
  });

  test('getRegeltekstAnnotaties builds the underscore path and caches the result', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        activiteiten: [],
        regelsVoorIedereen: [],
        regelteksten: [],
        locaties: [],
      }),
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

  test('zoekRegelingen defaults to the pre-production environment and size when omitted', async () => {
    await ozon.zoekRegelingen({ bevoegdGezag: ['gm0995'] });

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('https://pre.example/ozon');
    expect(url).toContain('size=100');
  });

  test('getRegeltekstAnnotaties defaults env, opts and the geldigOp cache key, and omits an empty query', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    await ozon.getRegeltekstAnnotaties('_akn_nl_act_gm0995_2020_omgevingsplan');

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('https://pre.example/ozon');
    expect(url).not.toContain('?');

    // The cache key falls back to 'today' when geldigOp is omitted: a second
    // call with an explicit geldigOp of 'today' must hit the same cache entry.
    await ozon.getRegeltekstAnnotaties('_akn_nl_act_gm0995_2020_omgevingsplan', 'pre', {
      geldigOp: 'today',
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('getRegeltekstAnnotaties defaults every missing array field to empty rather than throwing', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const data = await ozon.getRegeltekstAnnotaties('_akn_nl_act_gm0995_leeg');

    expect(data).toEqual({
      activiteiten: [],
      regelteksten: [],
      regelsVoorIedereen: [],
      locaties: [],
      gebiedsaanwijzingen: [],
      omgevingsnormen: [],
    });
  });

  test('getDocumentComponent defaults to the pre-production environment when omitted', async () => {
    await ozon.getDocumentComponent(
      '_akn_nl_act_gm0995_2020_omgevingsplan',
      'gm0995_5e613b8efac0433cb977d3445e057208__chp_15'
    );

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('https://pre.example/ozon');
  });
});
