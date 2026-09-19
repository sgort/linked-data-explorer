import express from 'express';
import request from 'supertest';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
// Mocking the service also keeps its ESM-only RDF dependencies
// (@rdfjs/dataset, rdf-validate-shacl) out of Jest's CommonJS runtime.
jest.mock('../services/shacl-validation.service', () => ({
  __esModule: true,
  shaclValidationService: { validateFile: jest.fn(), validateMerged: jest.fn() },
}));

import { shaclValidationService } from '../services/shacl-validation.service';
import shaclRoutes from './shacl.routes';
import { versionMiddleware } from '../middleware/version.middleware';
import { errorHandler } from '../middleware/error.middleware';
import { expectToMatchOperation } from '../openapi/testing/conformance';

const mockValidateFile = shaclValidationService.validateFile as jest.Mock;
const mockValidateMerged = shaclValidationService.validateMerged as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/v1/shacl', shaclRoutes);
  return app;
}

const RESULT = {
  valid: false,
  complete: false,
  parseError: null,
  layers: {
    'cpsv-ap': { label: 'CPSV-AP', loaded: true, issues: [] },
    'ronl-custom': { label: 'RONL Custom', loaded: true, issues: [] },
    cprmv: { label: 'CPRMV', loaded: false, issues: [] },
  },
  summary: { errors: 2, warnings: 1, infos: 0 },
};

// The same result with issues in a layer, so the documented ShaclIssue shape is
// exercised: the service sets `location` only when the violation has a focus
// node or a path (shacl-validation.service.ts:324-327).
const RESULT_WITH_ISSUES = {
  ...RESULT,
  layers: {
    ...RESULT.layers,
    'cpsv-ap': {
      label: 'CPSV-AP',
      loaded: true,
      issues: [
        {
          severity: 'error',
          code: 'SHACL-MINCOUNT',
          message: 'Public service must have a title.',
          location: 'http://example.org/service/1 dct:title',
        },
        { severity: 'warning', code: 'SHACL-DATATYPE', message: 'Expected an xsd:date value.' },
      ],
    },
  },
};

// A parse failure short-circuits before any layer runs, so every layer stays
// unloaded with no issues (shacl-validation.service.ts's emptyLayers()), and
// `complete` is false along with `valid`.
const RESULT_PARSE_ERROR = {
  valid: false,
  complete: false,
  parseError: 'Unexpected "]" on line 3',
  layers: {
    cprmv: { label: 'CPRMV', loaded: false, issues: [] },
    'cpsv-ap': { label: 'CPSV-AP', loaded: false, issues: [] },
    'ronl-custom': { label: 'RONL Custom', loaded: false, issues: [] },
  },
  summary: { errors: 0, warnings: 0, infos: 0 },
};

const TURTLE = '@prefix cpsv: <http://purl.org/vocab/cpsv#> . <#s> a cpsv:PublicService .';

beforeEach(() => {
  mockValidateFile.mockReset();
  mockValidateMerged.mockReset();
});

describe('POST /v1/shacl/validate', () => {
  test('validates the posted Turtle and returns the layered result', async () => {
    mockValidateFile.mockResolvedValue(RESULT);

    const res = await request(makeApp()).post('/v1/shacl/validate').send({ content: TURTLE });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(RESULT);
    expect(res.body.timestamp).toEqual(expect.any(String));
    expect(mockValidateFile).toHaveBeenCalledWith(TURTLE);
  });

  test.each([
    ['a missing content field', {}],
    ['an empty content string', { content: '' }],
    ['a non-string content field', { content: { turtle: TURTLE } }],
  ])('rejects %s with 400 INVALID_REQUEST', async (_label, body) => {
    const res = await request(makeApp()).post('/v1/shacl/validate').send(body);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      status: 400,
      title: 'Invalid request',
      detail: 'Request body must contain a "content" field with the Turtle as a string.',
      code: 'INVALID_REQUEST',
    });
    expect(mockValidateFile).not.toHaveBeenCalled();
  });

  test('a Turtle parse failure is a 200 with parseError set, not a 500', async () => {
    mockValidateFile.mockResolvedValue({
      ...RESULT,
      valid: false,
      parseError: 'Unexpected "]" on line 3',
    });

    const res = await request(makeApp()).post('/v1/shacl/validate').send({ content: 'garbage' });

    expect(res.status).toBe(200);
    expect(res.body.data.parseError).toBe('Unexpected "]" on line 3');
  });

  test('returns 500 with a VALIDATION_ERROR code when the validator throws', async () => {
    mockValidateFile.mockRejectedValue(new Error('shape files missing'));

    const res = await request(makeApp()).post('/v1/shacl/validate').send({ content: TURTLE });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      title: 'Validation failed',
      detail: 'shape files missing',
      code: 'VALIDATION_ERROR',
    });
  });
});

describe('POST /v1/shacl/validate-merged', () => {
  test('validates against the named SPARQL endpoint', async () => {
    mockValidateMerged.mockResolvedValue(RESULT);

    const res = await request(makeApp())
      .post('/v1/shacl/validate-merged')
      .send({ content: TURTLE, endpoint: 'https://triplydb.example/sparql' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(RESULT);
    expect(mockValidateMerged).toHaveBeenCalledWith(TURTLE, 'https://triplydb.example/sparql');
  });

  test('falls back to the configured endpoint when none is given', async () => {
    mockValidateMerged.mockResolvedValue(RESULT);

    await request(makeApp()).post('/v1/shacl/validate-merged').send({ content: TURTLE });

    expect(mockValidateMerged).toHaveBeenCalledWith(TURTLE, undefined);
  });

  test.each([
    ['a missing content field', {}],
    ['an empty content string', { content: '' }],
    ['a non-string content field', { content: 42 }],
  ])('rejects %s with 400 INVALID_REQUEST', async (_label, body) => {
    const res = await request(makeApp()).post('/v1/shacl/validate-merged').send(body);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_REQUEST');
    expect(mockValidateMerged).not.toHaveBeenCalled();
  });

  test('a failure fetching the published graph is a 500, since it is not the caller input', async () => {
    mockValidateMerged.mockRejectedValue(new Error('CONSTRUCT query failed'));

    const res = await request(makeApp())
      .post('/v1/shacl/validate-merged')
      .send({ content: TURTLE });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status: 500,
      title: 'Validation failed',
      detail: 'CONSTRUCT query failed',
      code: 'VALIDATION_ERROR',
    });
  });
});

describe('#142 endpoint check', () => {
  test('POST /v1/shacl/validate-merged refuses an internal endpoint without querying it', async () => {
    const res = await request(makeApp())
      .post('/v1/shacl/validate-merged')
      .send({ content: TURTLE, endpoint: 'https://169.254.169.254/latest' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'INVALID_INPUT',
      detail: '`endpoint` points to an internal address',
    });
    expect(mockValidateMerged).not.toHaveBeenCalled();
  });

  test('POST /v1/shacl/validate-merged refuses an internal endpoint, as documented', async () => {
    const app = express();
    app.use(express.json());
    app.use(versionMiddleware); // app-wide in index.ts
    app.use('/v1/shacl', shaclRoutes);
    app.use(errorHandler); // app-wide in index.ts

    const res = await request(app)
      .post('/v1/shacl/validate-merged')
      .send({ content: TURTLE, endpoint: 'https://169.254.169.254/latest' });

    expect(res.status).toBe(400);
    expectToMatchOperation(res, 'post', '/shacl/validate-merged');
  });
});

describe('/v1/shacl matches its OpenAPI description', () => {
  function makeDocumentedApp() {
    const app = express();
    app.use(express.json());
    app.use(versionMiddleware); // app-wide in index.ts
    app.use('/v1/shacl', shaclRoutes);
    app.use(errorHandler); // app-wide in index.ts; answers malformed JSON bodies
    return app;
  }

  const post = (path: string) => request(makeDocumentedApp()).post(`/v1/shacl${path}`);

  test('POST /validate 200, as documented', async () => {
    mockValidateFile.mockResolvedValue(RESULT);

    const res = await post('/validate').send({ content: TURTLE });

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'post', '/shacl/validate');
  });

  test('POST /validate 200 with a shape layer that failed to load (complete: false), as documented', async () => {
    mockValidateFile.mockResolvedValue(RESULT);

    const res = await post('/validate').send({ content: TURTLE });

    expect(res.status).toBe(200);
    expect(res.body.data.complete).toBe(false);
    expect(res.body.data.layers.cprmv.loaded).toBe(false);
    expectToMatchOperation(res, 'post', '/shacl/validate');
  });

  test('POST /validate 200 with issues, as documented', async () => {
    mockValidateFile.mockResolvedValue(RESULT_WITH_ISSUES);

    const res = await post('/validate').send({ content: TURTLE });

    expect(res.status).toBe(200);
    expect(res.body.data.layers['cpsv-ap'].issues).toHaveLength(2);
    expectToMatchOperation(res, 'post', '/shacl/validate');
  });

  test('POST /validate 200 with a parse error, as documented', async () => {
    mockValidateFile.mockResolvedValue(RESULT_PARSE_ERROR);

    const res = await post('/validate').send({ content: 'garbage' });

    expect(res.status).toBe(200);
    expect(res.body.data.parseError).toBe('Unexpected "]" on line 3');
    expectToMatchOperation(res, 'post', '/shacl/validate');
  });

  test('POST /validate 400, as documented', async () => {
    const res = await post('/validate').send({});

    expect(res.status).toBe(400);
    expectToMatchOperation(res, 'post', '/shacl/validate');
  });

  test('POST /validate 500, as documented', async () => {
    mockValidateFile.mockRejectedValue(new Error('shape files missing'));

    const res = await post('/validate').send({ content: TURTLE });

    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'post', '/shacl/validate');
  });

  test('POST /validate-merged 200, as documented', async () => {
    mockValidateMerged.mockResolvedValue(RESULT);

    const res = await post('/validate-merged').send({ content: TURTLE });

    expect(res.status).toBe(200);
    expectToMatchOperation(res, 'post', '/shacl/validate-merged');
  });

  test('POST /validate-merged 400, as documented', async () => {
    const res = await post('/validate-merged').send({});

    expect(res.status).toBe(400);
    expectToMatchOperation(res, 'post', '/shacl/validate-merged');
  });

  test('POST /validate-merged 500, as documented', async () => {
    mockValidateMerged.mockRejectedValue(new Error('CONSTRUCT query failed'));

    const res = await post('/validate-merged').send({ content: TURTLE });

    expect(res.status).toBe(500);
    expectToMatchOperation(res, 'post', '/shacl/validate-merged');
  });

  test('a malformed JSON body is a 400 problem response, as documented (#143)', async () => {
    const res = await post('/validate').set('Content-Type', 'application/json').send('{"content":');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MALFORMED_BODY');
    expectToMatchOperation(res, 'post', '/shacl/validate');
  });
});
