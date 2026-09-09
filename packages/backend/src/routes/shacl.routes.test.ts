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
  parseError: null,
  layers: {
    'cpsv-ap': { label: 'CPSV-AP', loaded: true, issues: [] },
    'ronl-custom': { label: 'RONL Custom', loaded: true, issues: [] },
    cprmv: { label: 'CPRMV', loaded: false, issues: [] },
  },
  summary: { errors: 2, warnings: 1, infos: 0 },
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
    expect(res.body.error).toEqual({
      code: 'INVALID_REQUEST',
      message: 'Request body must contain a "content" field with the Turtle as a string.',
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
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'shape files missing' },
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
    expect(res.body.error.code).toBe('INVALID_REQUEST');
    expect(mockValidateMerged).not.toHaveBeenCalled();
  });

  test('a failure fetching the published graph is a 500, since it is not the caller input', async () => {
    mockValidateMerged.mockRejectedValue(new Error('CONSTRUCT query failed'));

    const res = await request(makeApp())
      .post('/v1/shacl/validate-merged')
      .send({ content: TURTLE });

    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'CONSTRUCT query failed',
    });
  });
});
