import express from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../services/dso.service', () => ({
  __esModule: true,
  getActiviteitenByOin: jest.fn(),
  zoekActiviteiten: jest.fn(),
  getActiviteit: jest.fn(),
  getBegrippen: jest.fn(),
  getActiviteiten: jest.fn(),
  zoekWerkzaamheden: jest.fn(),
  suggereerWerkzaamheden: jest.fn(),
  getWerkzaamheidDetail: jest.fn(),
  getToepasbareRegels: jest.fn(),
  getSttrBestand: jest.fn(),
  extractDmnFromSttr: jest.fn(),
  extractFormScaffoldFromSttr: jest.fn(),
}));

import * as dsoService from '../services/dso.service';
import dsoRoutes from './dso.routes';
import packageJson from '../../package.json';
import { versionMiddleware } from '../middleware/version.middleware';
import { errorHandler } from '../middleware/error.middleware';
import { expectToMatchOperation } from '../openapi/testing/conformance';

const svc = dsoService as unknown as Record<string, jest.Mock>;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/v1/dso', dsoRoutes);
  return app;
}

beforeEach(() => {
  for (const fn of Object.values(svc)) {
    if (typeof fn === 'function') fn.mockReset();
  }
});

describe('environment selection', () => {
  beforeEach(() => svc.getActiviteiten.mockResolvedValue({ items: [] }));

  test('defaults to the pre-production DSO', async () => {
    await request(makeApp()).get('/v1/dso/activiteiten');

    expect(svc.getActiviteiten).toHaveBeenCalledWith(expect.anything(), 'pre');
  });

  test('switches to production via the x-dso-env header', async () => {
    await request(makeApp()).get('/v1/dso/activiteiten').set('x-dso-env', 'prod');

    expect(svc.getActiviteiten).toHaveBeenCalledWith(expect.anything(), 'prod');
  });

  test('switches to production via the env query parameter', async () => {
    await request(makeApp()).get('/v1/dso/activiteiten').query({ env: 'prod' });

    expect(svc.getActiviteiten).toHaveBeenCalledWith(expect.anything(), 'prod');
  });

  test('any other env value stays on pre-production', async () => {
    await request(makeApp()).get('/v1/dso/activiteiten').query({ env: 'acceptance' });

    expect(svc.getActiviteiten).toHaveBeenCalledWith(expect.anything(), 'pre');
  });
});

describe('POST /v1/dso/activiteiten/oin', () => {
  test('returns the activities registered by an authority', async () => {
    svc.getActiviteitenByOin.mockResolvedValue({ activiteiten: [{ urn: 'urn:a' }] });

    const res = await request(makeApp())
      .post('/v1/dso/activiteiten/oin')
      .send({ oin: '00000001002220647000', datum: '01-01-2026' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { activiteiten: [{ urn: 'urn:a' }] } });
    expect(svc.getActiviteitenByOin).toHaveBeenCalledWith(
      '00000001002220647000',
      'pre',
      '01-01-2026'
    );
    expect(res.headers['api-version']).toBe(packageJson.version);
  });

  test('rejects a request without an oin', async () => {
    const res = await request(makeApp()).post('/v1/dso/activiteiten/oin').send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'oin is required' });
    expect(svc.getActiviteitenByOin).not.toHaveBeenCalled();
  });

  test('maps an upstream failure to 502', async () => {
    svc.getActiviteitenByOin.mockRejectedValue(new Error('DSO returned 500'));

    const res = await request(makeApp())
      .post('/v1/dso/activiteiten/oin')
      .send({ oin: '00000001002220647000' });

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ success: false, error: 'DSO returned 500' });
  });

  test('falls back to a generic message for a non-Error rejection', async () => {
    svc.getActiviteitenByOin.mockRejectedValue('socket hang up');

    const res = await request(makeApp())
      .post('/v1/dso/activiteiten/oin')
      .send({ oin: '00000001002220647000' });

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('DSO request failed');
  });
});

describe('POST /v1/dso/activiteiten/zoek', () => {
  test('forwards the date and point geometry', async () => {
    svc.zoekActiviteiten.mockResolvedValue({ items: [] });

    const res = await request(makeApp())
      .post('/v1/dso/activiteiten/zoek')
      .send({ datum: '01-01-2026', lat: 52.5, lon: 5.5, page: 2, pageSize: 20 });

    expect(res.status).toBe(200);
    expect(svc.zoekActiviteiten).toHaveBeenCalledWith(
      { datum: '01-01-2026', lat: 52.5, lon: 5.5, page: 2, pageSize: 20 },
      'pre'
    );
  });

  test('accepts an empty body, letting the service apply its defaults', async () => {
    svc.zoekActiviteiten.mockResolvedValue({ items: [] });

    const res = await request(makeApp()).post('/v1/dso/activiteiten/zoek').send({});

    expect(res.status).toBe(200);
    expect(svc.zoekActiviteiten).toHaveBeenCalledWith(
      { datum: undefined, lat: undefined, lon: undefined, page: undefined, pageSize: undefined },
      'pre'
    );
  });

  test('maps an upstream failure to 502', async () => {
    svc.zoekActiviteiten.mockRejectedValue(new Error('bad geometry'));

    const res = await request(makeApp()).post('/v1/dso/activiteiten/zoek').send({});

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('bad geometry');
  });
});

describe('GET /v1/dso/activiteiten/:urn', () => {
  test('URL-decodes the URN before the lookup', async () => {
    svc.getActiviteit.mockResolvedValue({ urn: 'urn:nl:x' });

    const res = await request(makeApp()).get(
      `/v1/dso/activiteiten/${encodeURIComponent('urn:nl:imow:activiteit:1')}`
    );

    expect(res.status).toBe(200);
    expect(svc.getActiviteit).toHaveBeenCalledWith('urn:nl:imow:activiteit:1', undefined, 'pre');
  });

  test('forwards the datum query parameter', async () => {
    svc.getActiviteit.mockResolvedValue({});

    await request(makeApp()).get('/v1/dso/activiteiten/urn-a').query({ datum: '01-01-2026' });

    expect(svc.getActiviteit).toHaveBeenCalledWith('urn-a', '01-01-2026', 'pre');
  });

  test('translates an upstream 404 into a 404', async () => {
    svc.getActiviteit.mockRejectedValue(new Error('DSO responded 404 Not Found'));

    const res = await request(makeApp()).get('/v1/dso/activiteiten/urn-a');

    expect(res.status).toBe(404);
  });

  test('any other upstream failure is a 502', async () => {
    svc.getActiviteit.mockRejectedValue(new Error('DSO responded 500'));

    const res = await request(makeApp()).get('/v1/dso/activiteiten/urn-a');

    expect(res.status).toBe(502);
  });
});

describe('GET /v1/dso/begrippen', () => {
  test('parses the pagination parameters as integers', async () => {
    svc.getBegrippen.mockResolvedValue({ _embedded: {} });

    const res = await request(makeApp())
      .get('/v1/dso/begrippen')
      .query({ zoekTerm: 'kappen', geldigOp: '2026-01-01', page: '2', pageSize: '40' });

    expect(res.status).toBe(200);
    expect(svc.getBegrippen).toHaveBeenCalledWith(
      { zoekTerm: 'kappen', geldigOp: '2026-01-01', page: 2, pageSize: 40 },
      'pre'
    );
  });

  test('leaves pagination undefined when not supplied', async () => {
    svc.getBegrippen.mockResolvedValue({});

    await request(makeApp()).get('/v1/dso/begrippen');

    expect(svc.getBegrippen).toHaveBeenCalledWith(
      { zoekTerm: undefined, geldigOp: undefined, page: undefined, pageSize: undefined },
      'pre'
    );
  });

  test('maps an upstream failure to 502', async () => {
    svc.getBegrippen.mockRejectedValue(new Error('catalogus unavailable'));

    const res = await request(makeApp()).get('/v1/dso/begrippen');

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('catalogus unavailable');
  });

  test('falls back to a generic message for a non-Error rejection', async () => {
    svc.getBegrippen.mockRejectedValue({ code: 'ETIMEDOUT' });

    const res = await request(makeApp()).get('/v1/dso/begrippen');

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('DSO request failed');
  });
});

describe('GET /v1/dso/activiteiten', () => {
  test('parses the pagination parameters as integers', async () => {
    svc.getActiviteiten.mockResolvedValue({ items: [] });

    const res = await request(makeApp())
      .get('/v1/dso/activiteiten')
      .query({ datum: '01-01-2026', page: '3', pageSize: '100' });

    expect(res.status).toBe(200);
    expect(svc.getActiviteiten).toHaveBeenCalledWith(
      { datum: '01-01-2026', page: 3, pageSize: 100 },
      'pre'
    );
  });

  test('maps an upstream failure to 502', async () => {
    svc.getActiviteiten.mockRejectedValue(new Error('RTR unavailable'));

    const res = await request(makeApp()).get('/v1/dso/activiteiten');

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('RTR unavailable');
  });

  test('falls back to a generic message for a non-Error rejection', async () => {
    svc.getActiviteiten.mockRejectedValue(null);

    const res = await request(makeApp()).get('/v1/dso/activiteiten');

    expect(res.body.error).toBe('DSO request failed');
  });
});

describe('werkzaamheden search', () => {
  test('POST /werkzaamheden/zoek forwards the search parameters', async () => {
    svc.zoekWerkzaamheden.mockResolvedValue({ items: [] });

    const res = await request(makeApp())
      .post('/v1/dso/werkzaamheden/zoek')
      .send({ zoekterm: 'kappen', page: 1, pageSize: 10 });

    expect(res.status).toBe(200);
    expect(svc.zoekWerkzaamheden).toHaveBeenCalledWith(
      { zoekterm: 'kappen', page: 1, pageSize: 10 },
      'pre'
    );
  });

  test('POST /werkzaamheden/zoek maps an upstream failure to 502', async () => {
    svc.zoekWerkzaamheden.mockRejectedValue(new Error('zoekinterface down'));

    const res = await request(makeApp()).post('/v1/dso/werkzaamheden/zoek').send({});

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('zoekinterface down');
  });

  test('POST /werkzaamheden/suggereer returns the suggestions', async () => {
    svc.suggereerWerkzaamheden.mockResolvedValue(['kappen', 'kapvergunning']);

    const res = await request(makeApp())
      .post('/v1/dso/werkzaamheden/suggereer')
      .send({ zoekterm: 'kap' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(['kappen', 'kapvergunning']);
    expect(svc.suggereerWerkzaamheden).toHaveBeenCalledWith('kap', 'pre');
  });

  test('POST /werkzaamheden/suggereer requires a search term', async () => {
    const res = await request(makeApp()).post('/v1/dso/werkzaamheden/suggereer').send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'zoekterm is required' });
    expect(svc.suggereerWerkzaamheden).not.toHaveBeenCalled();
  });

  test('POST /werkzaamheden/suggereer maps an upstream failure to 502', async () => {
    svc.suggereerWerkzaamheden.mockRejectedValue(new Error('suggest endpoint down'));

    const res = await request(makeApp())
      .post('/v1/dso/werkzaamheden/suggereer')
      .send({ zoekterm: 'kap' });

    expect(res.status).toBe(502);
  });

  test('GET /werkzaamheden/:urn URL-decodes the URN', async () => {
    svc.getWerkzaamheidDetail.mockResolvedValue({ urn: 'urn:w' });

    const res = await request(makeApp()).get(
      `/v1/dso/werkzaamheden/${encodeURIComponent('urn:nl:imow:werkzaamheid:1')}`
    );

    expect(res.status).toBe(200);
    expect(svc.getWerkzaamheidDetail).toHaveBeenCalledWith('urn:nl:imow:werkzaamheid:1', 'pre');
  });

  test('GET /werkzaamheden/:urn translates an upstream 404', async () => {
    svc.getWerkzaamheidDetail.mockRejectedValue(new Error('404 not found'));

    const res = await request(makeApp()).get('/v1/dso/werkzaamheden/urn-w');

    expect(res.status).toBe(404);
  });

  test('GET /werkzaamheden/:urn maps other failures to 502', async () => {
    svc.getWerkzaamheidDetail.mockRejectedValue(new Error('gateway timeout'));

    const res = await request(makeApp()).get('/v1/dso/werkzaamheden/urn-w');

    expect(res.status).toBe(502);
  });
});

describe('GET /v1/dso/toepasbare-regels', () => {
  test('returns the metadata for a concept reference', async () => {
    svc.getToepasbareRegels.mockResolvedValue({ regels: [] });

    const res = await request(makeApp())
      .get('/v1/dso/toepasbare-regels')
      .query({ functioneleStructuurRef: 'https://example.org/concept/1' });

    expect(res.status).toBe(200);
    expect(svc.getToepasbareRegels).toHaveBeenCalledWith('https://example.org/concept/1', 'pre');
  });

  test('requires a functioneleStructuurRef', async () => {
    const res = await request(makeApp()).get('/v1/dso/toepasbare-regels');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'functioneleStructuurRef is required' });
    expect(svc.getToepasbareRegels).not.toHaveBeenCalled();
  });

  test('rejects a repeated functioneleStructuurRef, which arrives as an array', async () => {
    const res = await request(makeApp())
      .get('/v1/dso/toepasbare-regels')
      .query({ functioneleStructuurRef: ['a', 'b'] });

    expect(res.status).toBe(400);
  });

  test('translates an upstream 404', async () => {
    svc.getToepasbareRegels.mockRejectedValue(new Error('404 unknown concept'));

    const res = await request(makeApp())
      .get('/v1/dso/toepasbare-regels')
      .query({ functioneleStructuurRef: 'x' });

    expect(res.status).toBe(404);
  });

  test('maps other failures to 502', async () => {
    svc.getToepasbareRegels.mockRejectedValue(new Error('upstream error'));

    const res = await request(makeApp())
      .get('/v1/dso/toepasbare-regels')
      .query({ functioneleStructuurRef: 'x' });

    expect(res.status).toBe(502);
  });
});

describe('GET /v1/dso/toepasbare-regels/:id/sttr', () => {
  test('streams the STTR XML as a named attachment', async () => {
    svc.getSttrBestand.mockResolvedValue('<sttr/>');

    const res = await request(makeApp()).get('/v1/dso/toepasbare-regels/tr-1/sttr');

    expect(res.status).toBe(200);
    expect(res.text).toBe('<sttr/>');
    expect(res.headers['content-type']).toMatch(/application\/xml/);
    expect(res.headers['content-disposition']).toBe('attachment; filename="sttr-tr-1.xml"');
  });

  test('translates an upstream 404', async () => {
    svc.getSttrBestand.mockRejectedValue(new Error('404 no such regel'));

    const res = await request(makeApp()).get('/v1/dso/toepasbare-regels/tr-1/sttr');

    expect(res.status).toBe(404);
  });

  test('maps other failures to 502', async () => {
    svc.getSttrBestand.mockRejectedValue(new Error('upstream error'));

    const res = await request(makeApp()).get('/v1/dso/toepasbare-regels/tr-1/sttr');

    expect(res.status).toBe(502);
  });
});

describe('GET /v1/dso/toepasbare-regels/:id/dmn', () => {
  test('extracts the embedded DMN and serves it as a .dmn attachment', async () => {
    svc.getSttrBestand.mockResolvedValue('<sttr><dmn/></sttr>');
    svc.extractDmnFromSttr.mockReturnValue('<definitions/>');

    const res = await request(makeApp()).get('/v1/dso/toepasbare-regels/tr-1/dmn');

    expect(res.status).toBe(200);
    expect(res.text).toBe('<definitions/>');
    expect(res.headers['content-disposition']).toBe('attachment; filename="decision-tr-1.dmn"');
    expect(svc.extractDmnFromSttr).toHaveBeenCalledWith('<sttr><dmn/></sttr>');
  });

  test('answers 422 when the STTR carries no DMN to extract', async () => {
    svc.getSttrBestand.mockResolvedValue('<sttr/>');
    svc.extractDmnFromSttr.mockImplementation(() => {
      throw new Error('No DMN definitions found in STTR');
    });

    const res = await request(makeApp()).get('/v1/dso/toepasbare-regels/tr-1/dmn');

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('No DMN definitions found in STTR');
  });

  test('translates an upstream 404', async () => {
    svc.getSttrBestand.mockRejectedValue(new Error('404 no such regel'));

    const res = await request(makeApp()).get('/v1/dso/toepasbare-regels/tr-1/dmn');

    expect(res.status).toBe(404);
  });

  test('maps other failures to 502 with an extraction-specific fallback message', async () => {
    svc.getSttrBestand.mockRejectedValue('unknown');

    const res = await request(makeApp()).get('/v1/dso/toepasbare-regels/tr-1/dmn');

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('DMN extraction failed');
  });
});

describe('GET /v1/dso/toepasbare-regels/:id/form-scaffold', () => {
  test('scaffolds a form, defaulting the form id to the regel id', async () => {
    svc.getSttrBestand.mockResolvedValue('<sttr/>');
    svc.extractFormScaffoldFromSttr.mockReturnValue({ id: 'tr-1', components: [] });

    const res = await request(makeApp()).get('/v1/dso/toepasbare-regels/tr-1/form-scaffold');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { id: 'tr-1', components: [] } });
    expect(svc.extractFormScaffoldFromSttr).toHaveBeenCalledWith('<sttr/>', 'tr-1');
  });

  test('honours an explicit formId', async () => {
    svc.getSttrBestand.mockResolvedValue('<sttr/>');
    svc.extractFormScaffoldFromSttr.mockReturnValue({ id: 'kapvergunning' });

    await request(makeApp())
      .get('/v1/dso/toepasbare-regels/tr-1/form-scaffold')
      .query({ formId: 'kapvergunning' });

    expect(svc.extractFormScaffoldFromSttr).toHaveBeenCalledWith('<sttr/>', 'kapvergunning');
  });

  test('translates an upstream 404', async () => {
    svc.getSttrBestand.mockRejectedValue(new Error('404 no such regel'));

    const res = await request(makeApp()).get('/v1/dso/toepasbare-regels/tr-1/form-scaffold');

    expect(res.status).toBe(404);
  });

  test('maps other failures to 502 with a scaffold-specific fallback message', async () => {
    svc.getSttrBestand.mockResolvedValue('<sttr/>');
    svc.extractFormScaffoldFromSttr.mockImplementation(() => {
      throw 'unparseable';
    });

    const res = await request(makeApp()).get('/v1/dso/toepasbare-regels/tr-1/form-scaffold');

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('Form scaffold extraction failed');
  });
});

describe('/v1/dso activiteiten, begrippen and werkzaamheden operations match their OpenAPI description', () => {
  function makeDocumentedApp() {
    const app = express();
    app.use(express.json());
    app.use(versionMiddleware); // app-wide in index.ts
    app.use('/v1/dso', dsoRoutes);
    app.use(errorHandler); // app-wide in index.ts; answers malformed JSON bodies
    return app;
  }

  // Realistic HAL-shaped fixtures (embedded arrays, _links, paging), not the
  // bare-bones placeholders used by the handler tests above, so the loosely
  // typed `data` object is actually exercised with more than one key and more
  // than one nesting level.
  const ACTIVITEITEN_LIST = {
    _embedded: {
      activiteiten: [
        {
          urn: 'urn:nl:imow:activiteit:1',
          omschrijving: 'Kappen van bomen',
          bestuursorgaan: { oin: '00000001005024249000', naam: 'Gemeente Lelystad' },
        },
        {
          urn: 'urn:nl:imow:activiteit:2',
          omschrijving: 'Bouwen van een schuur',
          bestuursorgaan: { oin: '00000001006203243000', naam: 'Provincie Flevoland' },
        },
      ],
    },
    _links: {
      self: { href: '/activiteiten?datum=01-01-2026&page=1&pageSize=20' },
      next: { href: '/activiteiten?datum=01-01-2026&page=2&pageSize=20' },
    },
    page: 1,
    pageSize: 20,
    totalItems: 42,
  };

  const ACTIVITEIT_DETAIL = {
    urn: 'urn:nl:imow:activiteit:1',
    omschrijving: 'Kappen van bomen',
    bestuursorgaan: { oin: '00000001005024249000', naam: 'Gemeente Lelystad' },
    regelBeheerObjecten: [
      { type: 'Conclusie', functioneleStructuurRef: 'https://identifier.overheid.nl/concept/1' },
      {
        type: 'Indieningsvereisten',
        functioneleStructuurRef: 'https://identifier.overheid.nl/concept/2',
      },
    ],
    _links: {
      self: { href: '/activiteiten/urn:nl:imow:activiteit:1' },
      onderliggendeActiviteiten: [
        { href: '/activiteiten/urn:nl:imow:activiteit:1a' },
        { href: '/activiteiten/urn:nl:imow:activiteit:1b' },
      ],
    },
  };

  const BEGRIPPEN_LIST = {
    _embedded: {
      begrippen: [
        {
          identifier: 'https://identifier.overheid.nl/begrip/1',
          naam: 'Kappen',
          omschrijving: 'Het vellen van een houtopstand',
        },
        {
          identifier: 'https://identifier.overheid.nl/begrip/2',
          naam: 'Bouwen',
          omschrijving: 'Het oprichten van een bouwwerk',
        },
      ],
    },
    _links: { self: { href: '/begrippen?zoekTerm=kappen&page=1&pageSize=20' } },
    page: 1,
    pageSize: 20,
    totalItems: 2,
  };

  const WERKZAAMHEDEN_LIST = {
    _embedded: {
      werkzaamheden: [
        { urn: 'urn:nl:imow:werkzaamheid:1', omschrijving: 'Boom kappen' },
        { urn: 'urn:nl:imow:werkzaamheid:2', omschrijving: 'Steiger plaatsen' },
      ],
    },
    _links: { self: { href: '/werkzaamheden/_zoek?page=1&pageSize=20' } },
    page: 1,
    pageSize: 20,
    totalItems: 2,
  };

  const WERKZAAMHEID_DETAIL = {
    urn: 'urn:nl:imow:werkzaamheid:1',
    _embedded: {
      werkzaamheidversies: [
        {
          versie: 1,
          omschrijving: 'Boom kappen',
          trefwoorden: ['boom', 'kappen', 'vellen'],
          logischeRelaties: [{ type: 'vervangt', urn: 'urn:nl:imow:werkzaamheid:0' }],
        },
      ],
    },
    _links: { self: { href: '/werkzaamheden/urn:nl:imow:werkzaamheid:1' } },
  };

  // Ids and names taken from the two real STTR fixtures under
  // examples/organizations/flevoland/STTR/, so this list plausibly links to
  // the two XML fixtures below via `identifier`.
  const TOEPASBARE_REGELS_LIST = {
    _embedded: {
      toepasbareRegels: [
        { identifier: '105946', type: 'Conclusie', naam: 'Boom kappen of houtopstand vellen' },
        {
          identifier: '105947',
          type: 'Indieningsvereisten',
          naam: 'Indieningsvereisten Vergunning Boom kappen of houtopstand vellen',
        },
      ],
    },
    _links: {
      self: {
        href: '/toepasbareRegels?functioneleStructuurRef=https://identifier.overheid.nl/concept/1',
      },
    },
  };

  // A trimmed but well-formed excerpt of the real conclusie STTR
  // (sttr-105946.xml): same namespaces, id, name and one real question, so a
  // media-type or schema mistake on this operation has something genuinely
  // XML-shaped to fail against, not a one-line placeholder.
  const STTR_XML_FIXTURE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<dmn:definitions xmlns:dmn="http://www.omg.org/spec/DMN/20180521/MODEL/" xmlns:uitv="http://toepasbare-regels.omgevingswet.overheid.nl/v1.0/Uitvoeringsregel" name="Boom kappen of houtopstand vellen" id="_246fefaa_671a_47bf_9b35_5b6ebcf101a7">
  <dmn:extensionElements>
    <uitv:uitvoeringsregels>
      <uitv:uitvoeringsregel id="uitv__4483fe58-57b7-4e71-bf19-15783f0f9d92">
        <uitv:vraag>
          <uitv:gegevensType>boolean</uitv:gegevensType>
          <uitv:vraagTekst>Wilt u een boom of beplanting weghalen?</uitv:vraagTekst>
        </uitv:vraag>
      </uitv:uitvoeringsregel>
    </uitv:uitvoeringsregels>
  </dmn:extensionElements>
  <dmn:decision id="_dec1" name="Boom kappen of houtopstand vellen">
    <dmn:variable name="uitkomst" typeRef="string"/>
  </dmn:decision>
</dmn:definitions>`;

  // What extractDmnFromSttr would derive from the fixture above: DMN 1.3
  // namespace, an injected input id, a FEEL-safe variable name and a stamped
  // history time-to-live — the five real normalizations, not invented ones.
  const DMN_XML_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<dmn:definitions xmlns:dmn="https://www.omg.org/spec/DMN/20191111/MODEL/" xmlns:camunda="http://camunda.org/schema/1.0/dmn" name="Boom kappen of houtopstand vellen" id="_246fefaa_671a_47bf_9b35_5b6ebcf101a7">
  <dmn:decision id="_dec1" name="Boom kappen of houtopstand vellen" camunda:historyTimeToLive="180">
    <dmn:variable name="uitkomst" typeRef="string"/>
    <dmn:decisionTable>
      <dmn:input id="dsoInput_1">
        <dmn:inputExpression id="dsoInputExpr_1" typeRef="boolean">
          <dmn:text>uitv__4483fe58_57b7_4e71_bf19_15783f0f9d92</dmn:text>
        </dmn:inputExpression>
      </dmn:input>
      <dmn:output id="o1" typeRef="string"/>
    </dmn:decisionTable>
  </dmn:decision>
</dmn:definitions>`;

  // Mirrors the real indieningsvereisten STTR (sttr-105947.xml): a `list`
  // question with two options (-> select + values), a `string` +
  // inter:inputType=textarea question (-> textarea), a `string` question
  // with no textarea hint (-> textfield), a `number` question, a `boolean`
  // question (-> checkbox) and a uitv:bijlage requirement (-> textfield
  // placeholder) — every one of the five field types the extraction logic
  // can produce, and the one optional `values` array, all from real content.
  const FORM_SCAFFOLD = {
    schemaVersion: 17,
    id: '105947',
    type: 'default',
    components: [
      {
        id: 'uitv__5acd1773-b81c-436f-a91e-d37546ad5e24',
        type: 'select',
        label: 'Wat wilt u gaan doen?',
        key: '5acd1773_b81c_436f_a91e_d37546ad5e24',
        values: [
          { label: 'Kappen', value: 'Kappen' },
          { label: 'Anders', value: 'Anders' },
        ],
        validate: { required: false },
      },
      {
        id: 'uitv__625483ff-2dfd-4e63-8c52-2773cf169211',
        type: 'textarea',
        label: 'Beschrijf wat u wilt gaan doen.',
        key: '625483ff_2dfd_4e63_8c52_2773cf169211',
        validate: { required: false },
      },
      {
        id: 'uitv__06480753-bdb0-4d23-8fd7-8941fad930f2',
        type: 'textfield',
        label: 'Waarom wilt u de houtopstand onderhouden of weghalen?',
        key: '06480753_bdb0_4d23_8fd7_8941fad930f2',
        validate: { required: false },
      },
      {
        id: 'uitv__c1720883-89cf-47e5-97f0-36ef4d5fab05',
        type: 'number',
        label: 'Om hoeveel bomen gaat het?',
        key: 'c1720883_89cf_47e5_97f0_36ef4d5fab05',
        validate: { required: false },
      },
      {
        id: 'uitv__94af6398-3d9e-450b-bb64-12b1728fee00',
        type: 'checkbox',
        label: 'Bent u de eigenaar van de boom of houtopstand?',
        key: '94af6398_3d9e_450b_bb64_12b1728fee00',
        validate: { required: false },
      },
      {
        id: 'uitv__9d5e992e-4e3f-429b-930c-0e9d69e997de',
        type: 'textfield',
        label: '[Bijlage] Toestemming van de eigenaar',
        key: '9d5e992e_4e3f_429b_930c_0e9d69e997de',
        validate: { required: false },
      },
    ],
  };

  test('GET /activiteiten 200, as documented', async () => {
    svc.getActiviteiten.mockResolvedValue(ACTIVITEITEN_LIST);

    const res = await request(makeDocumentedApp())
      .get('/v1/dso/activiteiten')
      .query({ datum: '01-01-2026', page: '1', pageSize: '20' });

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/dso/activiteiten');
  });

  test('GET /activiteiten 502, as documented', async () => {
    svc.getActiviteiten.mockRejectedValue(new Error('RTR unavailable'));

    const res = await request(makeDocumentedApp()).get('/v1/dso/activiteiten');

    expect(res.status).toBe(502);
    expectToMatchOperation(res, 'get', '/dso/activiteiten');
  });

  test('POST /activiteiten/oin 200, as documented', async () => {
    svc.getActiviteitenByOin.mockResolvedValue(ACTIVITEITEN_LIST);

    const res = await request(makeDocumentedApp())
      .post('/v1/dso/activiteiten/oin')
      .send({ oin: '00000001002220647000', datum: '01-01-2026' });

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'post', '/dso/activiteiten/oin');
  });

  test('POST /activiteiten/oin 400, as documented', async () => {
    const res = await request(makeDocumentedApp()).post('/v1/dso/activiteiten/oin').send({});

    expect(res.status).toBe(400);
    expectToMatchOperation(res, 'post', '/dso/activiteiten/oin');
  });

  test('POST /activiteiten/oin 502, as documented', async () => {
    svc.getActiviteitenByOin.mockRejectedValue(new Error('DSO returned 500'));

    const res = await request(makeDocumentedApp())
      .post('/v1/dso/activiteiten/oin')
      .send({ oin: '00000001002220647000' });

    expect(res.status).toBe(502);
    expectToMatchOperation(res, 'post', '/dso/activiteiten/oin');
  });

  test('POST /activiteiten/oin 500 INTERNAL_ERROR for a malformed JSON body, as documented (#143)', async () => {
    const res = await request(makeDocumentedApp())
      .post('/v1/dso/activiteiten/oin')
      .set('Content-Type', 'application/json')
      .send('{"oin":');

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expectToMatchOperation(res, 'post', '/dso/activiteiten/oin');
  });

  test('POST /activiteiten/zoek 200, as documented', async () => {
    svc.zoekActiviteiten.mockResolvedValue(ACTIVITEITEN_LIST);

    const res = await request(makeDocumentedApp())
      .post('/v1/dso/activiteiten/zoek')
      .send({ datum: '01-01-2026', lat: 52.5, lon: 5.5, page: 2, pageSize: 20 });

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'post', '/dso/activiteiten/zoek');
  });

  test('POST /activiteiten/zoek 200 with an empty body, as documented', async () => {
    svc.zoekActiviteiten.mockResolvedValue(ACTIVITEITEN_LIST);

    const res = await request(makeDocumentedApp()).post('/v1/dso/activiteiten/zoek').send({});

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'post', '/dso/activiteiten/zoek');
  });

  test('POST /activiteiten/zoek 502, as documented', async () => {
    svc.zoekActiviteiten.mockRejectedValue(new Error('bad geometry'));

    const res = await request(makeDocumentedApp()).post('/v1/dso/activiteiten/zoek').send({});

    expect(res.status).toBe(502);
    expectToMatchOperation(res, 'post', '/dso/activiteiten/zoek');
  });

  test('POST /activiteiten/zoek 500 INTERNAL_ERROR for a malformed JSON body, as documented (#143)', async () => {
    const res = await request(makeDocumentedApp())
      .post('/v1/dso/activiteiten/zoek')
      .set('Content-Type', 'application/json')
      .send('{"datum":');

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expectToMatchOperation(res, 'post', '/dso/activiteiten/zoek');
  });

  test('GET /activiteiten/:urn 200, as documented', async () => {
    svc.getActiviteit.mockResolvedValue(ACTIVITEIT_DETAIL);

    const res = await request(makeDocumentedApp()).get(
      `/v1/dso/activiteiten/${encodeURIComponent('urn:nl:imow:activiteit:1')}`
    );

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/dso/activiteiten/{urn}');
  });

  test('GET /activiteiten/:urn 404, as documented', async () => {
    svc.getActiviteit.mockRejectedValue(new Error('DSO responded 404 Not Found'));

    const res = await request(makeDocumentedApp()).get('/v1/dso/activiteiten/urn-a');

    expect(res.status).toBe(404);
    expectToMatchOperation(res, 'get', '/dso/activiteiten/{urn}');
  });

  test('GET /activiteiten/:urn 502, as documented', async () => {
    svc.getActiviteit.mockRejectedValue(new Error('DSO responded 500'));

    const res = await request(makeDocumentedApp()).get('/v1/dso/activiteiten/urn-a');

    expect(res.status).toBe(502);
    expectToMatchOperation(res, 'get', '/dso/activiteiten/{urn}');
  });

  test('GET /begrippen 200, as documented', async () => {
    svc.getBegrippen.mockResolvedValue(BEGRIPPEN_LIST);

    const res = await request(makeDocumentedApp())
      .get('/v1/dso/begrippen')
      .query({ zoekTerm: 'kappen', geldigOp: '2026-01-01', page: '1', pageSize: '20' });

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/dso/begrippen');
  });

  test('GET /begrippen 502, as documented', async () => {
    svc.getBegrippen.mockRejectedValue(new Error('catalogus unavailable'));

    const res = await request(makeDocumentedApp()).get('/v1/dso/begrippen');

    expect(res.status).toBe(502);
    expectToMatchOperation(res, 'get', '/dso/begrippen');
  });

  test('POST /werkzaamheden/suggereer 200, as documented', async () => {
    svc.suggereerWerkzaamheden.mockResolvedValue(['kappen', 'kapvergunning']);

    const res = await request(makeDocumentedApp())
      .post('/v1/dso/werkzaamheden/suggereer')
      .send({ zoekterm: 'kap' });

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'post', '/dso/werkzaamheden/suggereer');
  });

  test('POST /werkzaamheden/suggereer 400, as documented', async () => {
    const res = await request(makeDocumentedApp()).post('/v1/dso/werkzaamheden/suggereer').send({});

    expect(res.status).toBe(400);
    expectToMatchOperation(res, 'post', '/dso/werkzaamheden/suggereer');
  });

  test('POST /werkzaamheden/suggereer 502, as documented', async () => {
    svc.suggereerWerkzaamheden.mockRejectedValue(new Error('suggest endpoint down'));

    const res = await request(makeDocumentedApp())
      .post('/v1/dso/werkzaamheden/suggereer')
      .send({ zoekterm: 'kap' });

    expect(res.status).toBe(502);
    expectToMatchOperation(res, 'post', '/dso/werkzaamheden/suggereer');
  });

  test('POST /werkzaamheden/suggereer 500 INTERNAL_ERROR for a malformed JSON body, as documented (#143)', async () => {
    const res = await request(makeDocumentedApp())
      .post('/v1/dso/werkzaamheden/suggereer')
      .set('Content-Type', 'application/json')
      .send('{"zoekterm":');

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expectToMatchOperation(res, 'post', '/dso/werkzaamheden/suggereer');
  });

  test('POST /werkzaamheden/zoek 200, as documented', async () => {
    svc.zoekWerkzaamheden.mockResolvedValue(WERKZAAMHEDEN_LIST);

    const res = await request(makeDocumentedApp())
      .post('/v1/dso/werkzaamheden/zoek')
      .send({ zoekterm: 'kappen', page: 1, pageSize: 20 });

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'post', '/dso/werkzaamheden/zoek');
  });

  test('POST /werkzaamheden/zoek 200 with an empty body, as documented', async () => {
    svc.zoekWerkzaamheden.mockResolvedValue(WERKZAAMHEDEN_LIST);

    const res = await request(makeDocumentedApp()).post('/v1/dso/werkzaamheden/zoek').send({});

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'post', '/dso/werkzaamheden/zoek');
  });

  test('POST /werkzaamheden/zoek 502, as documented', async () => {
    svc.zoekWerkzaamheden.mockRejectedValue(new Error('zoekinterface down'));

    const res = await request(makeDocumentedApp()).post('/v1/dso/werkzaamheden/zoek').send({});

    expect(res.status).toBe(502);
    expectToMatchOperation(res, 'post', '/dso/werkzaamheden/zoek');
  });

  test('POST /werkzaamheden/zoek 500 INTERNAL_ERROR for a malformed JSON body, as documented (#143)', async () => {
    const res = await request(makeDocumentedApp())
      .post('/v1/dso/werkzaamheden/zoek')
      .set('Content-Type', 'application/json')
      .send('{"zoekterm":');

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expectToMatchOperation(res, 'post', '/dso/werkzaamheden/zoek');
  });

  test('GET /werkzaamheden/:urn 200, as documented', async () => {
    svc.getWerkzaamheidDetail.mockResolvedValue(WERKZAAMHEID_DETAIL);

    const res = await request(makeDocumentedApp()).get(
      `/v1/dso/werkzaamheden/${encodeURIComponent('urn:nl:imow:werkzaamheid:1')}`
    );

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/dso/werkzaamheden/{urn}');
  });

  test('GET /werkzaamheden/:urn 404, as documented', async () => {
    svc.getWerkzaamheidDetail.mockRejectedValue(new Error('404 not found'));

    const res = await request(makeDocumentedApp()).get('/v1/dso/werkzaamheden/urn-w');

    expect(res.status).toBe(404);
    expectToMatchOperation(res, 'get', '/dso/werkzaamheden/{urn}');
  });

  test('GET /werkzaamheden/:urn 502, as documented', async () => {
    svc.getWerkzaamheidDetail.mockRejectedValue(new Error('gateway timeout'));

    const res = await request(makeDocumentedApp()).get('/v1/dso/werkzaamheden/urn-w');

    expect(res.status).toBe(502);
    expectToMatchOperation(res, 'get', '/dso/werkzaamheden/{urn}');
  });

  test('GET /toepasbare-regels 200, as documented', async () => {
    svc.getToepasbareRegels.mockResolvedValue(TOEPASBARE_REGELS_LIST);

    const res = await request(makeDocumentedApp())
      .get('/v1/dso/toepasbare-regels')
      .query({ functioneleStructuurRef: 'https://identifier.overheid.nl/concept/1' });

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/dso/toepasbare-regels');
  });

  test('GET /toepasbare-regels 400, as documented', async () => {
    const res = await request(makeDocumentedApp()).get('/v1/dso/toepasbare-regels');

    expect(res.status).toBe(400);
    expectToMatchOperation(res, 'get', '/dso/toepasbare-regels');
  });

  test('GET /toepasbare-regels 404, as documented', async () => {
    svc.getToepasbareRegels.mockRejectedValue(new Error('404 unknown concept'));

    const res = await request(makeDocumentedApp())
      .get('/v1/dso/toepasbare-regels')
      .query({ functioneleStructuurRef: 'x' });

    expect(res.status).toBe(404);
    expectToMatchOperation(res, 'get', '/dso/toepasbare-regels');
  });

  test('GET /toepasbare-regels 502, as documented', async () => {
    svc.getToepasbareRegels.mockRejectedValue(new Error('upstream error'));

    const res = await request(makeDocumentedApp())
      .get('/v1/dso/toepasbare-regels')
      .query({ functioneleStructuurRef: 'x' });

    expect(res.status).toBe(502);
    expectToMatchOperation(res, 'get', '/dso/toepasbare-regels');
  });

  test('GET /toepasbare-regels/:id/sttr 200, as documented', async () => {
    svc.getSttrBestand.mockResolvedValue(STTR_XML_FIXTURE);

    const res = await request(makeDocumentedApp()).get('/v1/dso/toepasbare-regels/105946/sttr');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/xml/);
    expectToMatchOperation(res, 'get', '/dso/toepasbare-regels/{id}/sttr');
  });

  test('GET /toepasbare-regels/:id/sttr 404, as documented', async () => {
    svc.getSttrBestand.mockRejectedValue(new Error('404 no such regel'));

    const res = await request(makeDocumentedApp()).get('/v1/dso/toepasbare-regels/tr-1/sttr');

    expect(res.status).toBe(404);
    expectToMatchOperation(res, 'get', '/dso/toepasbare-regels/{id}/sttr');
  });

  test('GET /toepasbare-regels/:id/sttr 502, as documented', async () => {
    svc.getSttrBestand.mockRejectedValue(new Error('upstream error'));

    const res = await request(makeDocumentedApp()).get('/v1/dso/toepasbare-regels/tr-1/sttr');

    expect(res.status).toBe(502);
    expectToMatchOperation(res, 'get', '/dso/toepasbare-regels/{id}/sttr');
  });

  test('GET /toepasbare-regels/:id/dmn 200, as documented', async () => {
    svc.getSttrBestand.mockResolvedValue(STTR_XML_FIXTURE);
    svc.extractDmnFromSttr.mockReturnValue(DMN_XML_FIXTURE);

    const res = await request(makeDocumentedApp()).get('/v1/dso/toepasbare-regels/105946/dmn');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/xml/);
    expectToMatchOperation(res, 'get', '/dso/toepasbare-regels/{id}/dmn');
  });

  test('GET /toepasbare-regels/:id/dmn 404, as documented', async () => {
    svc.getSttrBestand.mockRejectedValue(new Error('404 no such regel'));

    const res = await request(makeDocumentedApp()).get('/v1/dso/toepasbare-regels/tr-1/dmn');

    expect(res.status).toBe(404);
    expectToMatchOperation(res, 'get', '/dso/toepasbare-regels/{id}/dmn');
  });

  test('GET /toepasbare-regels/:id/dmn 422, as documented', async () => {
    svc.getSttrBestand.mockResolvedValue('<dmn:definitions/>');
    svc.extractDmnFromSttr.mockImplementation(() => {
      throw new Error('No DMN <definitions> element found in STTR XML');
    });

    const res = await request(makeDocumentedApp()).get('/v1/dso/toepasbare-regels/tr-1/dmn');

    expect(res.status).toBe(422);
    expectToMatchOperation(res, 'get', '/dso/toepasbare-regels/{id}/dmn');
  });

  test('GET /toepasbare-regels/:id/dmn 502, as documented', async () => {
    svc.getSttrBestand.mockRejectedValue(new Error('upstream error'));

    const res = await request(makeDocumentedApp()).get('/v1/dso/toepasbare-regels/tr-1/dmn');

    expect(res.status).toBe(502);
    expectToMatchOperation(res, 'get', '/dso/toepasbare-regels/{id}/dmn');
  });

  test('GET /toepasbare-regels/:id/form-scaffold 200, as documented', async () => {
    svc.getSttrBestand.mockResolvedValue(STTR_XML_FIXTURE);
    svc.extractFormScaffoldFromSttr.mockReturnValue(FORM_SCAFFOLD);

    const res = await request(makeDocumentedApp()).get(
      '/v1/dso/toepasbare-regels/105947/form-scaffold'
    );

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'get', '/dso/toepasbare-regels/{id}/form-scaffold');
  });

  test('GET /toepasbare-regels/:id/form-scaffold 404, as documented', async () => {
    svc.getSttrBestand.mockRejectedValue(new Error('404 no such regel'));

    const res = await request(makeDocumentedApp()).get(
      '/v1/dso/toepasbare-regels/tr-1/form-scaffold'
    );

    expect(res.status).toBe(404);
    expectToMatchOperation(res, 'get', '/dso/toepasbare-regels/{id}/form-scaffold');
  });

  test('GET /toepasbare-regels/:id/form-scaffold 502, as documented', async () => {
    svc.getSttrBestand.mockRejectedValue(new Error('upstream error'));

    const res = await request(makeDocumentedApp()).get(
      '/v1/dso/toepasbare-regels/tr-1/form-scaffold'
    );

    expect(res.status).toBe(502);
    expectToMatchOperation(res, 'get', '/dso/toepasbare-regels/{id}/form-scaffold');
  });
});
