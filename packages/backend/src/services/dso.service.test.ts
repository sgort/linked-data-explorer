jest.mock('../utils/logger', () => ({
  __esModule: true,
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const configMock = {
  dso: {
    catalogueBaseUrl: 'https://pre.example/catalogus',
    rtrBaseUrl: 'https://pre.example/rtr',
    zoekinterfaceBaseUrl: 'https://pre.example/zoek',
    opvragenWerkzaamhedenBaseUrl: 'https://pre.example/werkzaamheden',
    uitvoerenGegevensBaseUrl: 'https://pre.example/uitvoeren',
    apiKey: 'pre-key',
    timeout: 15000,
  },
  dsoProd: {
    catalogueBaseUrl: 'https://prod.example/catalogus',
    rtrBaseUrl: 'https://prod.example/rtr',
    zoekinterfaceBaseUrl: 'https://prod.example/zoek',
    opvragenWerkzaamhedenBaseUrl: 'https://prod.example/werkzaamheden',
    uitvoerenGegevensBaseUrl: 'https://prod.example/uitvoeren',
    apiKey: 'prod-key',
  },
};
jest.mock('../utils/config', () => ({
  __esModule: true,
  config: configMock,
  default: configMock,
}));

import {
  extractDmnFromSttr,
  extractFormScaffoldFromSttr,
  getActiviteit,
  getActiviteiten,
  getActiviteitenByOin,
  getBegrippen,
  getSttrBestand,
  getToepasbareRegels,
  getWerkzaamheidDetail,
  normalizeDmnForOperaton,
  suggereerWerkzaamheden,
  zoekActiviteiten,
  zoekWerkzaamheden,
} from './dso.service';

const mockFetch = jest.fn();
const realFetch = global.fetch;

/** Minimal stand-in for the parts of Response the service touches. */
function response(init: { ok?: boolean; status?: number; json?: unknown; text?: string } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => init.json ?? {},
    text: async () => init.text ?? JSON.stringify(init.json ?? {}),
  };
}

/** The most recent fetch call, with its init object defaulted rather than asserted. */
function lastCall(): { url: string; init: RequestInit } {
  const calls = mockFetch.mock.calls as Array<[string, RequestInit | undefined]>;
  const [url, init] = calls[calls.length - 1];
  return { url, init: init ?? {} };
}

function requestedUrl(): URL {
  return new URL(lastCall().url);
}

function requestHeaders(): Record<string, string> {
  return (lastCall().init.headers ?? {}) as Record<string, string>;
}

function requestBody(): Record<string, unknown> {
  return JSON.parse(String(lastCall().init.body));
}

// 5 March 2026 — fixes the "defaults to today" dd-MM-yyyy assertions.
const FIXED_NOW = new Date('2026-03-05T12:00:00Z');
const TODAY = '05-03-2026';

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(FIXED_NOW);
  mockFetch.mockReset().mockResolvedValue(response());
  global.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  jest.useRealTimers();
});

afterAll(() => {
  global.fetch = realFetch;
});

describe('getBegrippen', () => {
  test('queries the catalogue with default pagination', async () => {
    await getBegrippen();

    const url = requestedUrl();
    expect(url.origin + url.pathname).toBe('https://pre.example/catalogus/begrippen');
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('pageSize')).toBe('20');
    expect(url.searchParams.has('zoekTerm')).toBe(false);
  });

  test('passes the search term, validity date and pagination through', async () => {
    await getBegrippen({ zoekTerm: 'kappen', geldigOp: '2026-01-01', page: 3, pageSize: 40 });

    const url = requestedUrl();
    expect(url.searchParams.get('zoekTerm')).toBe('kappen');
    expect(url.searchParams.get('geldigOp')).toBe('2026-01-01');
    expect(url.searchParams.get('page')).toBe('3');
    expect(url.searchParams.get('pageSize')).toBe('40');
  });

  test('sends the pre-production API key and HAL accept header', async () => {
    await getBegrippen();

    expect(requestHeaders()).toEqual({
      'x-api-key': 'pre-key',
      Accept: 'application/hal+json',
    });
  });

  test('switches to the production host and key for env=prod', async () => {
    await getBegrippen({}, 'prod');

    expect(requestedUrl().origin).toBe('https://prod.example');
    expect(requestHeaders()['x-api-key']).toBe('prod-key');
  });

  test('returns the parsed HAL payload', async () => {
    mockFetch.mockResolvedValue(response({ json: { _embedded: { begrippen: [] } } }));

    await expect(getBegrippen()).resolves.toEqual({ _embedded: { begrippen: [] } });
  });

  test('raises the upstream status and body on a failure', async () => {
    mockFetch.mockResolvedValue(response({ ok: false, status: 404, text: 'not found' }));

    await expect(getBegrippen()).rejects.toThrow('DSO responded 404: not found');
  });
});

describe('getActiviteitenByOin', () => {
  test('posts the authority filter, defaulting the date to today', async () => {
    await getActiviteitenByOin('00000001002220647000');

    expect(requestBody()).toEqual({
      datum: TODAY,
      bestuursorgaan: { oin: '00000001002220647000' },
    });
    expect(lastCall().init.method).toBe('POST');
  });

  test('honours an explicit date', async () => {
    await getActiviteitenByOin('OIN', 'pre', '01-01-2026');

    expect(requestBody().datum).toBe('01-01-2026');
  });

  test('fetches the full set in one page so the UI can filter client-side', async () => {
    await getActiviteitenByOin('OIN');

    const url = requestedUrl();
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('pageSize')).toBe('200');
    expect(url.pathname).toBe('/rtr/activiteiten/_zoek');
  });

  test('raises the upstream status and body on a failure', async () => {
    mockFetch.mockResolvedValue(response({ ok: false, status: 500, text: 'boom' }));

    await expect(getActiviteitenByOin('OIN')).rejects.toThrow('DSO responded 500: boom');
  });

  test('targets the production RTR for env=prod', async () => {
    await getActiviteitenByOin('OIN', 'prod');

    expect(requestedUrl().origin).toBe('https://prod.example');
  });
});

describe('zoekActiviteiten', () => {
  test('searches on today by default, with no geometry', async () => {
    await zoekActiviteiten();

    expect(requestBody()).toEqual({ datum: TODAY });
    expect(requestedUrl().searchParams.has('crs')).toBe(false);
  });

  test('adds a GeoJSON point and the CRS when both coordinates are given', async () => {
    await zoekActiviteiten({ lat: 52.5, lon: 5.5 });

    expect(requestBody().geometrie).toEqual({ type: 'Point', coordinates: [5.5, 52.5] });
    expect(requestedUrl().searchParams.get('crs')).toBe('epsg:4326');
  });

  test.each([
    ['only a latitude', { lat: 52.5 }],
    ['only a longitude', { lon: 5.5 }],
  ])('omits the geometry when the caller supplies %s', async (_label, opts) => {
    await zoekActiviteiten(opts);

    expect(requestBody()).not.toHaveProperty('geometrie');
    expect(requestedUrl().searchParams.has('crs')).toBe(false);
  });

  test('forwards the pagination', async () => {
    await zoekActiviteiten({ page: 2, pageSize: 50 });

    const url = requestedUrl();
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('pageSize')).toBe('50');
  });

  test('parses the response body itself, so a failure can report the raw text', async () => {
    mockFetch.mockResolvedValue(response({ text: '{"items":[1]}' }));

    await expect(zoekActiviteiten()).resolves.toEqual({ items: [1] });
  });

  test('raises the upstream status and body on a failure', async () => {
    mockFetch.mockResolvedValue(response({ ok: false, status: 400, text: 'bad geometry' }));

    await expect(zoekActiviteiten()).rejects.toThrow('DSO responded 400: bad geometry');
  });
});

describe('getActiviteit', () => {
  test('URL-encodes the URN and defaults the date to today', async () => {
    await getActiviteit('urn:nl:imow:activiteit:1');

    const url = requestedUrl();
    expect(url.pathname).toBe('/rtr/activiteiten/urn%3Anl%3Aimow%3Aactiviteit%3A1');
    expect(url.searchParams.get('datum')).toBe(TODAY);
  });

  test('honours an explicit date', async () => {
    await getActiviteit('urn-a', '01-01-2026');

    expect(requestedUrl().searchParams.get('datum')).toBe('01-01-2026');
  });

  test('targets production when asked', async () => {
    await getActiviteit('urn-a', undefined, 'prod');

    expect(requestedUrl().origin).toBe('https://prod.example');
  });
});

describe('getActiviteiten', () => {
  test('lists activities valid today with default pagination', async () => {
    await getActiviteiten();

    const url = requestedUrl();
    expect(url.pathname).toBe('/rtr/activiteiten');
    expect(url.searchParams.get('datum')).toBe(TODAY);
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('pageSize')).toBe('20');
  });

  test('honours an explicit date and pagination', async () => {
    await getActiviteiten({ datum: '01-01-2026', page: 2, pageSize: 100 });

    const url = requestedUrl();
    expect(url.searchParams.get('datum')).toBe('01-01-2026');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('pageSize')).toBe('100');
  });
});

describe('zoekWerkzaamheden', () => {
  test('posts an empty filter when no search term is given', async () => {
    await zoekWerkzaamheden();

    expect(requestBody()).toEqual({});
    expect(requestedUrl().pathname).toBe('/zoek/werkzaamheden/_zoek');
  });

  test('includes the search term when one is given', async () => {
    await zoekWerkzaamheden({ zoekterm: 'kappen', page: 2, pageSize: 5 });

    expect(requestBody()).toEqual({ zoekterm: 'kappen' });
    const url = requestedUrl();
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('pageSize')).toBe('5');
  });

  test('raises the upstream status and body on a failure', async () => {
    mockFetch.mockResolvedValue(response({ ok: false, status: 503, text: 'unavailable' }));

    await expect(zoekWerkzaamheden()).rejects.toThrow('DSO responded 503: unavailable');
  });
});

describe('suggereerWerkzaamheden', () => {
  test('posts the search term to the suggest endpoint', async () => {
    await suggereerWerkzaamheden('kap');

    expect(requestedUrl().pathname).toBe('/zoek/werkzaamheden/_suggereer');
    expect(requestBody()).toEqual({ zoekterm: 'kap' });
    expect(requestHeaders().Accept).toBe('application/json');
  });

  test('raises the upstream status and body on a failure', async () => {
    mockFetch.mockResolvedValue(response({ ok: false, status: 400, text: 'too short' }));

    await expect(suggereerWerkzaamheden('k')).rejects.toThrow('DSO responded 400: too short');
  });
});

describe('getWerkzaamheidDetail', () => {
  test('URL-encodes the URN and requests the full relation set', async () => {
    await getWerkzaamheidDetail('urn:nl:imow:werkzaamheid:1');

    const url = requestedUrl();
    expect(url.pathname).toBe('/werkzaamheden/werkzaamheden/urn%3Anl%3Aimow%3Awerkzaamheid%3A1');
    expect(url.searchParams.get('pageSize')).toBe('100');
  });

  test('parses the response text as JSON', async () => {
    mockFetch.mockResolvedValue(response({ text: '{"urn":"x"}' }));

    await expect(getWerkzaamheidDetail('urn-a')).resolves.toEqual({ urn: 'x' });
  });

  test('raises the upstream status and body on a failure', async () => {
    mockFetch.mockResolvedValue(response({ ok: false, status: 404, text: 'unknown' }));

    await expect(getWerkzaamheidDetail('urn-a')).rejects.toThrow('DSO responded 404: unknown');
  });
});

describe('getToepasbareRegels', () => {
  test('filters on the functioneleStructuurRef', async () => {
    await getToepasbareRegels('https://example.org/concept/1');

    const url = requestedUrl();
    expect(url.pathname).toBe('/uitvoeren/toepasbareRegels');
    expect(url.searchParams.get('functioneleStructuurRef')).toBe('https://example.org/concept/1');
  });
});

describe('getSttrBestand', () => {
  test('downloads the raw XML with an XML accept header', async () => {
    mockFetch.mockResolvedValue(response({ text: '<sttr/>' }));

    await expect(getSttrBestand('tr-1')).resolves.toBe('<sttr/>');
    expect(requestedUrl().pathname).toBe('/uitvoeren/toepasbareRegels/tr-1/sttrBestand');
    expect(requestHeaders()).toEqual({
      'x-api-key': 'pre-key',
      Accept: 'application/xml',
    });
  });

  test('URL-encodes the id', async () => {
    await getSttrBestand('tr/1');

    expect(requestedUrl().pathname).toBe('/uitvoeren/toepasbareRegels/tr%2F1/sttrBestand');
  });

  test('raises the upstream status and body on a failure', async () => {
    mockFetch.mockResolvedValue(response({ ok: false, status: 404, text: 'no such regel' }));

    await expect(getSttrBestand('tr-1')).rejects.toThrow('DSO responded 404: no such regel');
  });
});

describe('normalizeDmnForOperaton', () => {
  test('upgrades the DMN 1.2 spec namespaces to 1.3, which the engine can transform', () => {
    const out = normalizeDmnForOperaton(
      '<definitions xmlns="http://www.omg.org/spec/DMN/20180521/MODEL/" ' +
        'xmlns:dmndi="http://www.omg.org/spec/DMN/20180521/DMNDI/"></definitions>'
    );

    expect(out).toContain('https://www.omg.org/spec/DMN/20191111/MODEL/');
    expect(out).toContain('https://www.omg.org/spec/DMN/20191111/DMNDI/');
    expect(out).not.toContain('20180521');
  });

  test('leaves an already-1.3 document alone', () => {
    const xml = '<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/"></definitions>';

    expect(normalizeDmnForOperaton(xml)).toContain('20191111');
  });

  test('gives every unidentified input an id, which the engine requires', () => {
    const out = normalizeDmnForOperaton(
      '<definitions><input label="a"></input><input></input></definitions>'
    );

    expect(out).toContain('id="dsoInput_1"');
    expect(out).toContain('id="dsoInput_2"');
  });

  test('leaves inputs that already carry an id untouched', () => {
    const out = normalizeDmnForOperaton('<definitions><input id="keep"></input></definitions>');

    expect(out).toContain('id="keep"');
    expect(out).not.toContain('dsoInput_');
  });

  test('gives every unidentified inputExpression an id', () => {
    const out = normalizeDmnForOperaton(
      '<definitions><inputExpression><text>x</text></inputExpression></definitions>'
    );

    expect(out).toContain('id="dsoInputExpr_1"');
  });

  test('renames variables to FEEL-safe identifiers', () => {
    const out = normalizeDmnForOperaton(
      '<definitions><variable name="uitv__ab-cd ef" typeRef="string" /></definitions>'
    );

    expect(out).toContain('name="uitv__ab_cd_ef"');
  });

  test('prefixes a name that would start with a digit', () => {
    const out = normalizeDmnForOperaton('<definitions><variable name="1abc" /></definitions>');

    expect(out).toContain('name="_1abc"');
  });

  test('leaves an already-safe name unchanged', () => {
    const out = normalizeDmnForOperaton('<definitions><variable name="bsn" /></definitions>');

    expect(out).toContain('name="bsn"');
  });

  test('disambiguates two names that sanitise to the same identifier', () => {
    const out = normalizeDmnForOperaton(
      '<definitions><variable name="a-b" /><variable name="a b" /></definitions>'
    );

    expect(out).toContain('name="a_b"');
    expect(out).toContain('name="a_b_1"');
  });

  test('rewrites inputExpression references to the renamed variable', () => {
    const out = normalizeDmnForOperaton(
      '<definitions><variable name="a-b" />' +
        '<inputExpression id="e1"><text>a-b</text></inputExpression></definitions>'
    );

    expect(out).toContain('<text>a_b</text>');
  });

  test('rewrites a CDATA-wrapped inputExpression reference', () => {
    const out = normalizeDmnForOperaton(
      '<definitions><variable name="a-b" />' +
        '<inputExpression id="e1"><text><![CDATA[a-b]]></text></inputExpression></definitions>'
    );

    expect(out).toContain('<text>a_b</text>');
  });

  test('leaves an inputExpression that references no known variable alone', () => {
    const out = normalizeDmnForOperaton(
      '<definitions><variable name="a-b" />' +
        '<inputExpression id="e1"><text>somethingElse</text></inputExpression></definitions>'
    );

    expect(out).toContain('<text>somethingElse</text>');
  });

  test('types untyped output columns from the decision result variable', () => {
    const out = normalizeDmnForOperaton(
      '<definitions><decision id="d"><variable name="res" typeRef="boolean" />' +
        '<output id="o1" /></decision></definitions>'
    );

    expect(out).toContain('typeRef="boolean"');
  });

  test('falls back to string when the decision declares no result type', () => {
    const out = normalizeDmnForOperaton(
      '<definitions><decision id="d"><output id="o1" /></decision></definitions>'
    );

    expect(out).toContain('typeRef="string"');
  });

  test('leaves an already-typed output column alone', () => {
    const out = normalizeDmnForOperaton(
      '<definitions><decision id="d"><variable name="res" typeRef="boolean" />' +
        '<output id="o1" typeRef="date" /></decision></definitions>'
    );

    expect(out).toContain('typeRef="date"');
    expect(out).not.toContain('typeRef="boolean" typeRef');
  });

  test('stamps a history TTL on every decision so the deploy is accepted', () => {
    const out = normalizeDmnForOperaton(
      '<definitions><decision id="d1"></decision><decision id="d2"></decision></definitions>'
    );

    expect(out.match(/camunda:historyTimeToLive="180"/g)).toHaveLength(2);
  });

  test('declares the camunda namespace alongside the TTL', () => {
    const out = normalizeDmnForOperaton('<definitions><decision id="d"></decision></definitions>');

    expect(out).toContain('xmlns:camunda="http://camunda.org/schema/1.0/dmn"');
  });

  test('does not redeclare an already-present camunda namespace', () => {
    const out = normalizeDmnForOperaton(
      '<definitions xmlns:camunda="http://camunda.org/schema/1.0/dmn">' +
        '<decision id="d"></decision></definitions>'
    );

    expect(out.match(/xmlns:camunda=/g)).toHaveLength(1);
  });

  test('leaves a decision that already declares a TTL alone', () => {
    const out = normalizeDmnForOperaton(
      '<definitions><decision id="d" camunda:historyTimeToLive="7"></decision></definitions>'
    );

    expect(out).toContain('camunda:historyTimeToLive="7"');
    expect(out).not.toContain('"180"');
  });

  test('handles namespace-prefixed element names', () => {
    const out = normalizeDmnForOperaton(
      '<dmn:definitions><dmn:decision id="d"><dmn:variable name="a-b" />' +
        '<dmn:output id="o" /></dmn:decision></dmn:definitions>'
    );

    expect(out).toContain('xmlns:camunda=');
    expect(out).toContain('camunda:historyTimeToLive="180"');
    expect(out).toContain('name="a_b"');
    expect(out).toContain('typeRef="string"');
  });
});

describe('extractDmnFromSttr', () => {
  test('lifts the embedded definitions element out of the STTR envelope', () => {
    const sttr =
      '<sttr:conclusie xmlns:sttr="urn:sttr"><dmn:definitions id="d">' +
      '<dmn:decision id="dec" /></dmn:definitions></sttr:conclusie>';

    const dmn = extractDmnFromSttr(sttr);

    expect(dmn).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>\n/);
    expect(dmn).toContain('<dmn:definitions');
    expect(dmn).not.toContain('sttr:conclusie');
  });

  test('handles an un-prefixed definitions element', () => {
    const dmn = extractDmnFromSttr('<wrapper><definitions id="d"></definitions></wrapper>');

    expect(dmn).toContain('<definitions');
  });

  test('normalises the extracted DMN so it deploys as handed off', () => {
    const sttr =
      '<wrapper><definitions xmlns="http://www.omg.org/spec/DMN/20180521/MODEL/">' +
      '<decision id="d"><variable name="a-b" /><output id="o" /></decision>' +
      '</definitions></wrapper>';

    const dmn = extractDmnFromSttr(sttr);

    expect(dmn).toContain('20191111');
    expect(dmn).toContain('camunda:historyTimeToLive="180"');
    expect(dmn).toContain('name="a_b"');
  });

  test('fails clearly when the STTR carries no DMN', () => {
    expect(() => extractDmnFromSttr('<sttr:conclusie/>')).toThrow(
      'No DMN <definitions> element found in STTR XML'
    );
  });
});

describe('extractFormScaffoldFromSttr', () => {
  function sttr(regels: string) {
    return `<dmn:definitions xmlns:dmn="urn:dmn" xmlns:uitv="urn:uitv" xmlns:inter="urn:inter">
  <dmn:extensionElements>
    <uitv:uitvoeringsregels>${regels}</uitv:uitvoeringsregels>
  </dmn:extensionElements>
</dmn:definitions>`;
  }

  function vraag(id: string, inner: string) {
    return `<uitv:uitvoeringsregel id="${id}"><uitv:vraag>${inner}</uitv:vraag></uitv:uitvoeringsregel>`;
  }

  test('returns an empty form-js schema when there are no rules', () => {
    expect(extractFormScaffoldFromSttr('<dmn:definitions/>', 'kapvergunning')).toEqual({
      schemaVersion: 17,
      id: 'kapvergunning',
      components: [],
      type: 'default',
    });
  });

  test('maps a boolean question to a checkbox', () => {
    const { components } = extractFormScaffoldFromSttr(
      sttr(
        vraag(
          'uitv__abc',
          '<uitv:gegevensType>boolean</uitv:gegevensType><uitv:vraagTekst>Kapt u een boom?</uitv:vraagTekst>'
        )
      ),
      'f1'
    );

    expect(components[0]).toEqual({
      id: 'uitv__abc',
      type: 'checkbox',
      label: 'Kapt u een boom?',
      key: 'abc',
      validate: { required: false },
    });
  });

  test('maps a number question to a number field', () => {
    const { components } = extractFormScaffoldFromSttr(
      sttr(
        vraag(
          'uitv__n',
          '<uitv:gegevensType>number</uitv:gegevensType><uitv:vraagTekst>Hoeveel?</uitv:vraagTekst>'
        )
      ),
      'f1'
    );

    expect(components[0].type).toBe('number');
  });

  test('maps a list question to a select carrying its options', () => {
    const { components } = extractFormScaffoldFromSttr(
      sttr(
        vraag(
          'uitv__l',
          '<uitv:gegevensType>list</uitv:gegevensType><uitv:vraagTekst>Welke soort?</uitv:vraagTekst>' +
            '<uitv:opties><uitv:optie><uitv:optieText>Eik</uitv:optieText></uitv:optie>' +
            '<uitv:optie><uitv:optieText>Beuk</uitv:optieText></uitv:optie></uitv:opties>'
        )
      ),
      'f1'
    );

    expect(components[0]).toMatchObject({
      type: 'select',
      values: [
        { label: 'Eik', value: 'Eik' },
        { label: 'Beuk', value: 'Beuk' },
      ],
    });
  });

  test('a list question with no options yields a select without values', () => {
    const { components } = extractFormScaffoldFromSttr(
      sttr(
        vraag(
          'uitv__l',
          '<uitv:gegevensType>list</uitv:gegevensType><uitv:vraagTekst>?</uitv:vraagTekst>'
        )
      ),
      'f1'
    );

    expect(components[0].type).toBe('select');
    expect(components[0]).not.toHaveProperty('values');
  });

  test('honours a textarea input hint', () => {
    const { components } = extractFormScaffoldFromSttr(
      sttr(
        vraag(
          'uitv__t',
          '<uitv:gegevensType>string</uitv:gegevensType><uitv:vraagTekst>Toelichting</uitv:vraagTekst>' +
            '<inter:inputType>textarea</inter:inputType>'
        )
      ),
      'f1'
    );

    expect(components[0].type).toBe('textarea');
  });

  test('falls back to a text field for anything else', () => {
    const { components } = extractFormScaffoldFromSttr(
      sttr(
        vraag(
          'uitv__s',
          '<uitv:gegevensType>string</uitv:gegevensType><uitv:vraagTekst>Naam</uitv:vraagTekst>'
        )
      ),
      'f1'
    );

    expect(components[0].type).toBe('textfield');
  });

  test('defaults to a text field when the question declares no data type', () => {
    const { components } = extractFormScaffoldFromSttr(
      sttr(vraag('uitv__x', '<uitv:vraagTekst>Naam</uitv:vraagTekst>')),
      'f1'
    );

    expect(components[0]).toMatchObject({ type: 'textfield', label: 'Naam' });
  });

  test('defaults the label to empty when the question has no text', () => {
    const { components } = extractFormScaffoldFromSttr(
      sttr(vraag('uitv__x', '<uitv:gegevensType>boolean</uitv:gegevensType>')),
      'f1'
    );

    expect(components[0]).toMatchObject({ type: 'checkbox', label: '' });
  });

  test('an empty question element produces no component at all', () => {
    const { components } = extractFormScaffoldFromSttr(sttr(vraag('uitv__x', '')), 'f1');

    expect(components).toEqual([]);
  });

  test('emits an attachment requirement as a labelled placeholder', () => {
    const { components } = extractFormScaffoldFromSttr(
      sttr(
        '<uitv:uitvoeringsregel id="uitv__b"><uitv:bijlage>' +
          '<uitv:bijlageType>Situatietekening</uitv:bijlageType></uitv:bijlage></uitv:uitvoeringsregel>'
      ),
      'f1'
    );

    expect(components[0]).toEqual({
      id: 'uitv__b',
      type: 'textfield',
      label: '[Bijlage] Situatietekening',
      key: 'b',
      validate: { required: false },
    });
  });

  test('skips geo references, which form-js cannot represent', () => {
    const { components } = extractFormScaffoldFromSttr(
      sttr(
        '<uitv:uitvoeringsregel id="uitv__g"><uitv:geoVerwijzing /></uitv:uitvoeringsregel>' +
          vraag('uitv__q', '<uitv:vraagTekst>Naam</uitv:vraagTekst>')
      ),
      'f1'
    );

    expect(components.map((c) => c.id)).toEqual(['uitv__q']);
  });

  test('derives a FEEL-safe key from the rule id', () => {
    const { components } = extractFormScaffoldFromSttr(
      sttr(vraag('uitv__ab-cd.ef', '<uitv:vraagTekst>?</uitv:vraagTekst>')),
      'f1'
    );

    expect(components[0].key).toBe('ab_cd_ef');
  });

  test('reads an un-prefixed definitions root as well', () => {
    const xml = `<definitions xmlns:uitv="urn:uitv">
  <dmn:extensionElements xmlns:dmn="urn:dmn">
    <uitv:uitvoeringsregels>${vraag('uitv__a', '<uitv:vraagTekst>Naam</uitv:vraagTekst>')}</uitv:uitvoeringsregels>
  </dmn:extensionElements>
</definitions>`;

    const { components } = extractFormScaffoldFromSttr(xml, 'f1');

    expect(components).toHaveLength(1);
  });

  test('stamps the requested form id onto the schema', () => {
    expect(extractFormScaffoldFromSttr(sttr(''), 'kapvergunning').id).toBe('kapvergunning');
  });
});
