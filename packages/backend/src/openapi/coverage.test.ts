// Keeps openapi/openapi.yaml, openapi/pending.json and the Express routes in step
// (#129). pending.json lists operations not described yet; the list may only
// shrink, and #137 empties it.

// The real registry is imported, as in routes/registry.test.ts: only db/pool is
// stubbed, since importing it for real would open a Postgres connection the run
// never closes.
jest.mock('../db/pool', () => ({ __esModule: true, default: null }));
jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
// ESM-only dependencies of the SHACL service that Jest's CommonJS runtime cannot
// load; see routes/registry.test.ts.
jest.mock('@rdfjs/dataset', () => ({ __esModule: true, default: { dataset: () => ({}) } }));
jest.mock('rdf-validate-shacl', () => ({ __esModule: true, default: class {} }));

import fs from 'fs';
import path from 'path';

import { routeRegistry } from '../routes/registry';
import { readOpenApiDocument } from './document';
import { listDocumentedOperations, listServedOperations } from './testing/routeOperations';

const PENDING_PATH = path.resolve(__dirname, '../../openapi/pending.json');

// The pending list may only shrink (#129). Lower this in the same change that
// documents operations (#134–#137). A route added without documentation pushes
// the list past it and fails the test below.
const PENDING_CEILING = 53;

const pending: string[] = JSON.parse(fs.readFileSync(PENDING_PATH, 'utf8'));
const served = listServedOperations(routeRegistry);
const documented = listDocumentedOperations(readOpenApiDocument());

describe('OpenAPI coverage of the /v1 routes', () => {
  test('every served operation is documented or pending', () => {
    expect(served.filter((op) => !documented.includes(op) && !pending.includes(op))).toEqual([]);
  });

  test('no pending operation is already documented', () => {
    expect(pending.filter((op) => documented.includes(op))).toEqual([]);
  });

  test('every pending operation is still served', () => {
    expect(pending.filter((op) => !served.includes(op))).toEqual([]);
  });

  test('every documented operation is served', () => {
    expect(documented.filter((op) => !served.includes(op))).toEqual([]);
  });

  test('pending lists each operation once', () => {
    expect(new Set(pending).size).toBe(pending.length);
  });

  test('pending never grows past its ceiling', () => {
    expect(pending.length).toBeLessThanOrEqual(PENDING_CEILING);
  });
});
