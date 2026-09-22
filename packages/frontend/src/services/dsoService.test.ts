import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';

import {
  clearActiviteitDossierCache,
  dmnDownloadUrl,
  type DsoDossier,
  fetchFormScaffold,
  fetchToepasbareRegels,
  getActiviteitDetail,
  getActiviteitDossier,
  getActiviteiten,
  getActiviteitenByOin,
  getWerkzaamheidDetail,
  searchBegrippen,
  sttrDownloadUrl,
  suggereerWerkzaamheden,
  urnFromHref,
  zoekActiviteiten,
  zoekWerkzaamheden,
} from './dsoService';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('urnFromHref (pure)', () => {
  test('extracts the URN from a HAL href', () => {
    expect(urnFromHref('https://example.com/activiteiten/abc-123?datum=2026-01-01')).toBe(
      'abc-123'
    );
  });

  test('decodes a URL-encoded URN', () => {
    expect(urnFromHref('https://example.com/activiteiten/abc%2F123')).toBe('abc/123');
  });

  test('returns the input unchanged when it does not match the pattern', () => {
    expect(urnFromHref('not-a-href')).toBe('not-a-href');
  });
});

describe('sttrDownloadUrl / dmnDownloadUrl (pure)', () => {
  test('sttrDownloadUrl omits the env param for "pre"', () => {
    expect(sttrDownloadUrl(123, 'pre')).toMatch(/\/v1\/dso\/toepasbare-regels\/123\/sttr$/);
  });

  test('sttrDownloadUrl appends ?env=prod for "prod"', () => {
    expect(sttrDownloadUrl(123, 'prod')).toMatch(/\/sttr\?env=prod$/);
  });

  test('dmnDownloadUrl appends ?env=prod for "prod"', () => {
    expect(dmnDownloadUrl(456, 'prod')).toMatch(/\/dmn\?env=prod$/);
  });
});

describe('searchBegrippen', () => {
  test('parses the HAL envelope and reports hasNext from _links.next', async () => {
    server.use(
      http.get('*/v1/dso/begrippen', () =>
        HttpResponse.json({
          success: true,
          data: {
            _embedded: { begrippen: [{ uri: 'x', naam: 'Bouwwerk' }] },
            page: { number: 1, size: 20 },
            _links: { next: { href: 'x' } },
          },
        })
      )
    );

    const result = await searchBegrippen('bouwwerk');
    expect(result).toEqual({
      items: [{ uri: 'x', naam: 'Bouwwerk' }],
      page: { number: 1, size: 20 },
      hasNext: true,
    });
  });

  test('falls back to an empty items array and default page when embedded/page are absent', async () => {
    server.use(
      http.get('*/v1/dso/begrippen', () => HttpResponse.json({ success: true, data: {} }))
    );
    const result = await searchBegrippen('', 3);
    expect(result).toEqual({ items: [], page: { number: 3, size: 10 }, hasNext: false });
  });

  test('throws when the HTTP request fails', async () => {
    server.use(http.get('*/v1/dso/begrippen', () => new HttpResponse(null, { status: 500 })));
    await expect(searchBegrippen('x')).rejects.toThrow('HTTP 500');
  });

  test('throws when the envelope reports success: false', async () => {
    server.use(
      http.get('*/v1/dso/begrippen', () => HttpResponse.json({ success: false, data: {} }))
    );
    await expect(searchBegrippen('x')).rejects.toThrow('DSO request failed');
  });
});

describe('activiteiten-shaped endpoints', () => {
  const activiteitenEnvelope = {
    success: true,
    data: {
      _embedded: { activiteiten: [{ urn: 'urn:1', omschrijving: 'Kappen' }] },
      page: { number: 1, size: 20 },
      _links: { next: null },
    },
  };

  test('getActiviteitenByOin posts the oin/datum and parses the result', async () => {
    let body: unknown;
    server.use(
      http.post('*/v1/dso/activiteiten/oin', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(activiteitenEnvelope);
      })
    );
    const result = await getActiviteitenByOin('oin-123', 'pre', '2026-01-01');
    expect(body).toEqual({ oin: 'oin-123', datum: '2026-01-01' });
    expect(result.items).toEqual([{ urn: 'urn:1', omschrijving: 'Kappen' }]);
    expect(result.hasNext).toBe(false);
  });

  test('getActiviteitenByOin throws on failure', async () => {
    server.use(
      http.post('*/v1/dso/activiteiten/oin', () => new HttpResponse(null, { status: 502 }))
    );
    await expect(getActiviteitenByOin('oin-123')).rejects.toThrow('HTTP 502');
  });

  test('zoekActiviteiten posts the search options', async () => {
    server.use(
      http.post('*/v1/dso/activiteiten/zoek', () => HttpResponse.json(activiteitenEnvelope))
    );
    const result = await zoekActiviteiten({ lat: 52.1, lon: 5.2, page: 2 });
    expect(result.items).toHaveLength(1);
  });

  test('getActiviteitenByOin throws when the envelope reports success: false', async () => {
    server.use(
      http.post('*/v1/dso/activiteiten/oin', () => HttpResponse.json({ success: false, data: {} }))
    );
    await expect(getActiviteitenByOin('oin-123')).rejects.toThrow('DSO OIN request failed');
  });

  test('zoekActiviteiten throws on a non-ok response', async () => {
    server.use(
      http.post('*/v1/dso/activiteiten/zoek', () => new HttpResponse(null, { status: 500 }))
    );
    await expect(zoekActiviteiten({})).rejects.toThrow('HTTP 500');
  });

  test('zoekActiviteiten throws when the envelope reports success: false', async () => {
    server.use(
      http.post('*/v1/dso/activiteiten/zoek', () => HttpResponse.json({ success: false, data: {} }))
    );
    await expect(zoekActiviteiten({})).rejects.toThrow('DSO search failed');
  });

  test('zoekActiviteiten falls back to the requested page and an empty list', async () => {
    server.use(
      http.post('*/v1/dso/activiteiten/zoek', () => HttpResponse.json({ success: true, data: {} }))
    );

    const result = await zoekActiviteiten({ page: 3, pageSize: 50 });

    expect(result).toEqual({ items: [], page: { number: 3, size: 50 }, hasNext: false });
  });

  test('zoekActiviteiten defaults the page when the caller supplies none', async () => {
    server.use(
      http.post('*/v1/dso/activiteiten/zoek', () => HttpResponse.json({ success: true, data: {} }))
    );

    expect((await zoekActiviteiten({})).page).toEqual({ number: 1, size: 20 });
  });

  test('zoekActiviteiten reports hasNext when the envelope carries a next link', async () => {
    server.use(
      http.post('*/v1/dso/activiteiten/zoek', () =>
        HttpResponse.json({
          success: true,
          data: { _links: { next: { href: 'https://example.com/next' } } },
        })
      )
    );

    expect((await zoekActiviteiten({})).hasNext).toBe(true);
  });

  test('getActiviteiten falls back to an empty list and a default page', async () => {
    server.use(
      http.get('*/v1/dso/activiteiten', () => HttpResponse.json({ success: true, data: {} }))
    );

    expect(await getActiviteiten()).toEqual({
      items: [],
      page: { number: 1, size: 20 },
      hasNext: false,
    });
  });

  test('getActiviteiten reports hasNext when the envelope carries a next link', async () => {
    server.use(
      http.get('*/v1/dso/activiteiten', () =>
        HttpResponse.json({
          success: true,
          data: { _links: { next: { href: 'https://example.com/next' } } },
        })
      )
    );

    expect((await getActiviteiten()).hasNext).toBe(true);
  });

  test('getActiviteiten fetches with page/pageSize params', async () => {
    let url = '';
    server.use(
      http.get('*/v1/dso/activiteiten', ({ request }) => {
        url = request.url;
        return HttpResponse.json(activiteitenEnvelope);
      })
    );
    await getActiviteiten('2026-01-01', 2);
    expect(url).toContain('page=2');
    expect(url).toContain('datum=2026-01-01');
  });
});

describe('werkzaamheden endpoints', () => {
  test('zoekWerkzaamheden parses the werkzaamheden embedded list', async () => {
    server.use(
      http.post('*/v1/dso/werkzaamheden/zoek', () =>
        HttpResponse.json({
          success: true,
          data: {
            _embedded: { werkzaamheden: [{ urn: 'w1', omschrijving: 'Kappen' }] },
            page: { number: 1, size: 20 },
            _links: {},
          },
        })
      )
    );
    const result = await zoekWerkzaamheden('kappen');
    expect(result.items).toEqual([{ urn: 'w1', omschrijving: 'Kappen' }]);
    expect(result.hasNext).toBe(false);
  });

  test('suggereerWerkzaamheden returns the flat string array', async () => {
    server.use(
      http.post('*/v1/dso/werkzaamheden/suggereer', () =>
        HttpResponse.json({ success: true, data: ['kappen', 'kapvergunning'] })
      )
    );
    expect(await suggereerWerkzaamheden('kap')).toEqual(['kappen', 'kapvergunning']);
  });

  test('suggereerWerkzaamheden returns [] (not a throw) on a non-ok response', async () => {
    server.use(
      http.post('*/v1/dso/werkzaamheden/suggereer', () => new HttpResponse(null, { status: 500 }))
    );
    expect(await suggereerWerkzaamheden('kap')).toEqual([]);
  });

  test('getWerkzaamheidDetail returns the werkzaamheidversies list', async () => {
    server.use(
      http.get('*/v1/dso/werkzaamheden/:urn', () =>
        HttpResponse.json({
          success: true,
          data: {
            _embedded: {
              werkzaamheidversies: [{ urn: 'w1', omschrijving: 'x', beginDatum: '2026-01-01' }],
            },
          },
        })
      )
    );
    const result = await getWerkzaamheidDetail('w1');
    expect(result).toEqual([{ urn: 'w1', omschrijving: 'x', beginDatum: '2026-01-01' }]);
  });

  test('getWerkzaamheidDetail returns [] when embedded is absent', async () => {
    server.use(
      http.get('*/v1/dso/werkzaamheden/:urn', () => HttpResponse.json({ success: true, data: {} }))
    );
    expect(await getWerkzaamheidDetail('w1')).toEqual([]);
  });
});

describe('werkzaamheden edge cases', () => {
  test('zoekWerkzaamheden sends no zoekterm when the search box is blank', async () => {
    let body: unknown;
    server.use(
      http.post('*/v1/dso/werkzaamheden/zoek', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true, data: {} });
      })
    );

    await zoekWerkzaamheden('   ');

    expect(body).toEqual({ page: 1, pageSize: 20 });
  });

  test('zoekWerkzaamheden throws on a non-ok response', async () => {
    server.use(
      http.post('*/v1/dso/werkzaamheden/zoek', () => new HttpResponse(null, { status: 503 }))
    );
    await expect(zoekWerkzaamheden('kappen')).rejects.toThrow('HTTP 503');
  });

  test('zoekWerkzaamheden throws when the envelope reports success: false', async () => {
    server.use(
      http.post('*/v1/dso/werkzaamheden/zoek', () =>
        HttpResponse.json({ success: false, data: {} })
      )
    );
    await expect(zoekWerkzaamheden('kappen')).rejects.toThrow('DSO search failed');
  });

  test('zoekWerkzaamheden falls back to the requested page and reports hasNext', async () => {
    server.use(
      http.post('*/v1/dso/werkzaamheden/zoek', () =>
        HttpResponse.json({
          success: true,
          data: { _links: { next: { href: 'https://example.com/next' } } },
        })
      )
    );

    expect(await zoekWerkzaamheden('kappen', 4)).toEqual({
      items: [],
      page: { number: 4, size: 20 },
      hasNext: true,
    });
  });

  test('suggereerWerkzaamheden returns [] when the envelope reports success: false', async () => {
    server.use(
      http.post('*/v1/dso/werkzaamheden/suggereer', () =>
        HttpResponse.json({ success: false, data: null })
      )
    );
    expect(await suggereerWerkzaamheden('kap')).toEqual([]);
  });

  test('suggereerWerkzaamheden returns [] when the payload is not an array', async () => {
    server.use(
      http.post('*/v1/dso/werkzaamheden/suggereer', () =>
        HttpResponse.json({ success: true, data: { unexpected: true } })
      )
    );
    expect(await suggereerWerkzaamheden('kap')).toEqual([]);
  });

  test('getWerkzaamheidDetail throws on a non-ok response', async () => {
    server.use(
      http.get('*/v1/dso/werkzaamheden/:urn', () => new HttpResponse(null, { status: 404 }))
    );
    await expect(getWerkzaamheidDetail('urn:1')).rejects.toThrow('HTTP 404');
  });

  test('getWerkzaamheidDetail throws when the envelope reports success: false', async () => {
    server.use(
      http.get('*/v1/dso/werkzaamheden/:urn', () => HttpResponse.json({ success: false, data: {} }))
    );
    await expect(getWerkzaamheidDetail('urn:1')).rejects.toThrow('DSO request failed');
  });
});

describe('getActiviteitDetail', () => {
  test('fetches the activiteit detail with an optional datum param', async () => {
    let url = '';
    server.use(
      http.get('*/v1/dso/activiteiten/:urn', ({ request }) => {
        url = request.url;
        return HttpResponse.json({ success: true, data: { urn: 'urn:1', verfijnbaar: true } });
      })
    );
    const result = await getActiviteitDetail('urn:1', '2026-01-01');
    expect(url).toContain('datum=2026-01-01');
    expect(result).toEqual({ urn: 'urn:1', verfijnbaar: true });
  });
});

describe('fetchToepasbareRegels', () => {
  test('parses a HAL list under _embedded.toepasbareRegelsList', async () => {
    server.use(
      http.get('*/v1/dso/toepasbare-regels', () =>
        HttpResponse.json({
          success: true,
          data: { _embedded: { toepasbareRegelsList: [{ identifier: 1 }] } },
        })
      )
    );
    expect(await fetchToepasbareRegels('fs-ref')).toEqual({ items: [{ identifier: 1 }] });
  });

  test('accepts the alternative _embedded.toepasbareRegels key', async () => {
    server.use(
      http.get('*/v1/dso/toepasbare-regels', () =>
        HttpResponse.json({
          success: true,
          data: { _embedded: { toepasbareRegels: [{ identifier: 7 }] } },
        })
      )
    );
    expect(await fetchToepasbareRegels('fs-ref')).toEqual({ items: [{ identifier: 7 }] });
  });

  test('falls back to [] when the embedded value is not a list', async () => {
    server.use(
      http.get('*/v1/dso/toepasbare-regels', () =>
        HttpResponse.json({
          success: true,
          data: { _embedded: { toepasbareRegelsList: { not: 'a list' } } },
        })
      )
    );
    expect(await fetchToepasbareRegels('fs-ref')).toEqual({ items: [] });
  });

  test('falls back to [] when neither known key is present', async () => {
    server.use(
      http.get('*/v1/dso/toepasbare-regels', () => HttpResponse.json({ success: true, data: {} }))
    );
    expect(await fetchToepasbareRegels('fs-ref')).toEqual({ items: [] });
  });
});

describe('fetchFormScaffold', () => {
  test('fetches the scaffold with the formId query param', async () => {
    let url = '';
    server.use(
      http.get('*/v1/dso/toepasbare-regels/:id/form-scaffold', ({ request }) => {
        url = request.url;
        return HttpResponse.json({
          success: true,
          data: { schemaVersion: 1, id: 'form-1', components: [], type: 'default' },
        });
      })
    );
    const result = await fetchFormScaffold(1, 'form-1');
    expect(url).toContain('formId=form-1');
    expect(result.id).toBe('form-1');
  });
});

describe('getActiviteitDossier', () => {
  // Shape-faithful to reference/dossier-houtopstandvellen-*.md: both rule
  // sets present, item arrays populated, and one input with `question: null`
  // (opaque-dangling) alongside one with a resolved question.
  const dossierFixture: DsoDossier = {
    urn: 'urn:1',
    omschrijving: 'Vellen houtopstand',
    bestuursorgaan: { code: 'gm0995', oin: '00000001823288624000' },
    legalSource: {
      available: true,
      regelingIdentificatie: 'reg-1',
      regelingTitel: 'Omgevingsplan gemeente Voorbeeld',
      juridischeRegels: [
        {
          identificatie: 'jr-1',
          kwalificatie: 'vergunningplicht',
          idealisatie: null,
          regeltekstRef: 'rt-1',
          wId: 'nl.regelgeving-art_15.2__para_5',
          locaties: [{ identificatie: 'loc-1', naam: 'Werkingsgebied A' }],
          articleText: 'De omgevingsvergunning wordt verleend indien...',
        },
      ],
    },
    annotation: {
      identificatie: 'ann-1',
      naam: 'Vellen houtopstand',
      groep: 'kapactiviteit',
      symboolcode: null,
      bovenliggendeActiviteitRef: null,
    },
    rtrLocaties: ['loc-1'],
    decisionCriteria: {
      typering: 'Conclusie',
      identifier: 114233,
      sttrVersie: 2,
      begindatum: '30-07-2026',
      toestemming: 'omgevingsvergunning',
      functioneleStructuurRef: 'fs-conclusie',
      viewerUrl: 'https://omgevingswet.overheid.nl/registratie-toepasbare-regels/id/concept-1',
      dmn: '<definitions/>',
    },
    submissionRequirements: {
      typering: 'Indieningsvereisten',
      identifier: 114234,
      sttrVersie: 2,
      begindatum: '30-07-2026',
      toestemming: 'omgevingsvergunning',
      functioneleStructuurRef: 'fs-indiening',
      viewerUrl: 'https://omgevingswet.overheid.nl/registratie-toepasbare-regels/id/concept-2',
      dmn: '<definitions/>',
    },
    provenance: {
      env: 'pre',
      datum: null,
      regelingIdentificatie: 'reg-1',
      fetchedAt: '2026-09-22T10:00:00.000Z',
      failures: [],
    },
    qualityProfile: {
      urn: 'urn:1',
      activityIdentity: 'semantic',
      legalTraceability: { rules: 1, withWId: 1, withArticleText: 1 },
      crossLayerConsistency: { sharedObjects: [] },
      ruleSets: {
        conclusie: {
          decisionNaming: {
            total: 2,
            semantic: 1,
            opaque: 1,
            items: [
              { name: 'GoedTeKeuren', class: 'semantic' },
              { name: '3f1a2b4c5d6e7f8091a2b3c4d5e6f708', class: 'opaque-resolvable' },
            ],
          },
          inputNaming: {
            total: 2,
            semantic: 1,
            opaque: 1,
            items: [
              { name: 'Omtrek', class: 'semantic', question: 'Wat is de omtrek?' },
              {
                name: '3f1a2b4c5d6e7f8091a2b3c4d5e6f708',
                class: 'opaque-dangling',
                question: null,
              },
            ],
          },
          labelCoverage: { inputs: 2, withQuestion: 1 },
          refResolvability: { total: 1, resolved: 1, dangling: 0 },
        },
        indieningsvereisten: {
          decisionNaming: {
            total: 1,
            semantic: 0,
            opaque: 1,
            items: [{ name: '9f8e7d6c5b4a39281706f5e4d3c2b1a0', class: 'opaque-dangling' }],
          },
          inputNaming: {
            total: 1,
            semantic: 0,
            opaque: 1,
            items: [
              {
                name: '9f8e7d6c5b4a39281706f5e4d3c2b1a0',
                class: 'opaque-dangling',
                question: null,
              },
            ],
          },
          labelCoverage: { inputs: 1, withQuestion: 0 },
          refResolvability: { total: 0, resolved: 0, dangling: 0 },
        },
      },
    },
  };

  afterEach(() => {
    clearActiviteitDossierCache();
  });

  test('fetches the dossier at the right path with the datum param and X-Dso-Env header, for pre and prod', async () => {
    const captured: { url: string; envHeader: string | null }[] = [];
    server.use(
      http.get('*/v1/dso/activiteiten/:urn/dossier', ({ request }) => {
        captured.push({ url: request.url, envHeader: request.headers.get('X-Dso-Env') });
        return HttpResponse.json({ success: true, data: dossierFixture });
      })
    );

    await getActiviteitDossier('urn:1', 'pre', '30-07-2026');
    await getActiviteitDossier('urn:1', 'prod', '30-07-2026');

    expect(captured).toHaveLength(2);
    expect(captured[0].url).toContain('/v1/dso/activiteiten/urn%3A1/dossier');
    expect(captured[0].url).toContain('datum=30-07-2026');
    expect(captured[0].envHeader).toBe('pre');
    expect(captured[1].envHeader).toBe('prod');
  });

  test('sends the authority param when supplied, and omits it when not', async () => {
    const urls: string[] = [];
    server.use(
      http.get('*/v1/dso/activiteiten/:urn/dossier', ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json({ success: true, data: dossierFixture });
      })
    );

    await getActiviteitDossier('urn:with-authority', 'pre', undefined, 'gm0995');
    await getActiviteitDossier('urn:without-authority', 'pre');

    expect(urls[0]).toContain('authority=gm0995');
    expect(urls[1]).not.toContain('authority=');
  });

  test('a second call with the same env/datum/urn makes no second fetch', async () => {
    let callCount = 0;
    server.use(
      http.get('*/v1/dso/activiteiten/:urn/dossier', () => {
        callCount += 1;
        return HttpResponse.json({ success: true, data: dossierFixture });
      })
    );

    const first = await getActiviteitDossier('urn:cache', 'pre', '30-07-2026');
    const second = await getActiviteitDossier('urn:cache', 'pre', '30-07-2026');

    expect(callCount).toBe(1);
    expect(second).toEqual(first);
  });

  test('a different env, a different datum and a different urn each make a new fetch', async () => {
    let callCount = 0;
    server.use(
      http.get('*/v1/dso/activiteiten/:urn/dossier', () => {
        callCount += 1;
        return HttpResponse.json({ success: true, data: dossierFixture });
      })
    );

    await getActiviteitDossier('urn:x', 'pre', '30-07-2026');
    await getActiviteitDossier('urn:x', 'prod', '30-07-2026'); // different env
    await getActiviteitDossier('urn:x', 'pre', '01-01-2026'); // different datum
    await getActiviteitDossier('urn:y', 'pre', '30-07-2026'); // different urn

    expect(callCount).toBe(4);
  });

  test('an undefined datum produces a stable cache key, distinct from a real date', async () => {
    let callCount = 0;
    server.use(
      http.get('*/v1/dso/activiteiten/:urn/dossier', () => {
        callCount += 1;
        return HttpResponse.json({ success: true, data: dossierFixture });
      })
    );

    await getActiviteitDossier('urn:no-datum', 'pre');
    await getActiviteitDossier('urn:no-datum', 'pre'); // same undefined datum -> cache hit
    await getActiviteitDossier('urn:no-datum', 'pre', '30-07-2026'); // a real date -> new fetch

    expect(callCount).toBe(2);
  });

  test('clearing the cache forces a refetch', async () => {
    let callCount = 0;
    server.use(
      http.get('*/v1/dso/activiteiten/:urn/dossier', () => {
        callCount += 1;
        return HttpResponse.json({ success: true, data: dossierFixture });
      })
    );

    await getActiviteitDossier('urn:clear', 'pre');
    clearActiviteitDossierCache();
    await getActiviteitDossier('urn:clear', 'pre');

    expect(callCount).toBe(2);
  });

  test('throws HTTP {status} on a non-ok response, and does not cache the failure', async () => {
    let callCount = 0;
    server.use(
      http.get('*/v1/dso/activiteiten/:urn/dossier', () => {
        callCount += 1;
        return new HttpResponse(null, { status: 502 });
      })
    );

    await expect(getActiviteitDossier('urn:error', 'pre')).rejects.toThrow('HTTP 502');
    await expect(getActiviteitDossier('urn:error', 'pre')).rejects.toThrow('HTTP 502');
    expect(callCount).toBe(2);
  });

  test('throws when the envelope reports success: false', async () => {
    server.use(
      http.get('*/v1/dso/activiteiten/:urn/dossier', () =>
        HttpResponse.json({ success: false, data: null })
      )
    );
    await expect(getActiviteitDossier('urn:fail', 'pre')).rejects.toThrow('DSO request failed');
  });
});
