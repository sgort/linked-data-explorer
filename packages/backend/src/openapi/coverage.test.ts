// Keeps openapi/openapi.yaml and the Express routes in step (#129). Every
// operation the registry serves under /v1 must be described, and every
// described operation must be served. A route added without a description
// fails here, which is what closing the pending list (#137) bought.

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

import { routeRegistry } from '../routes/registry';
import { readOpenApiDocument } from './document';
import { listDocumentedOperations, listServedOperations } from './testing/routeOperations';

const served = listServedOperations(routeRegistry);
const documented = listDocumentedOperations(readOpenApiDocument());

describe('OpenAPI coverage of the /v1 routes', () => {
  // The two rules below cross-check each other, but both pass if each side is
  // empty — a document that failed to parse and a registry that failed to load
  // agree with each other perfectly. The pending list's ceiling used to be the
  // only assertion about a count; this is what replaces it.
  test('both sides were actually loaded', () => {
    expect(served.length).toBeGreaterThan(0);
    expect(documented.length).toBeGreaterThan(0);
  });

  test('every served operation is documented', () => {
    expect(served.filter((op) => !documented.includes(op))).toEqual([]);
  });

  test('every documented operation is served', () => {
    expect(documented.filter((op) => !served.includes(op))).toEqual([]);
  });
});
