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
