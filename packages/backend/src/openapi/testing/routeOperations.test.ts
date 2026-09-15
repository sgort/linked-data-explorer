import cors from 'cors';
import { Router } from 'express';

import type { OpenApiDocument } from '../document';
import { listDocumentedOperations, listServedOperations, toDocumentPath } from './routeOperations';

const handler = () => undefined;

describe('toDocumentPath', () => {
  test.each([
    ['/v1/health', '/', '/health'],
    ['/v1/dmns', '/:identifier/xml', '/dmns/{identifier}/xml'],
    ['/v1/chains/templates', '/categories/list', '/chains/templates/categories/list'],
    ['/v1/assets', '/bpmn/by-bpmn-id/:bpmnProcessId', '/assets/bpmn/by-bpmn-id/{bpmnProcessId}'],
  ])('%s + %s is %s', (mount, routePath, expected) => {
    expect(toDocumentPath(mount, routePath)).toBe(expected);
  });

  test('rejects a mount outside /v1', () => {
    expect(() => toDocumentPath('/api/health', '/')).toThrow('/api/health is not a /v1 mount');
  });
});

describe('listServedOperations', () => {
  test('lists every method of every route and skips middleware', () => {
    const router = Router();
    router.use(cors());
    router.get('/', handler);
    router.route('/:id').get(handler).delete(handler);

    expect(listServedOperations([{ mount: '/v1/things', router }])).toEqual([
      'DELETE /things/{id}',
      'GET /things',
      'GET /things/{id}',
    ]);
  });

  // Each of these would otherwise be skipped or misread, leaving an operation
  // the coverage gate never sees.
  test('fails loudly on a nested router', () => {
    const router = Router();
    router.use('/sub', Router());

    expect(() => listServedOperations([{ mount: '/v1/things', router }])).toThrow(
      '/v1/things: nested routers are not supported'
    );
  });

  test('fails loudly on router.all', () => {
    const router = Router();
    router.all('/', handler);

    expect(() => listServedOperations([{ mount: '/v1/things', router }])).toThrow(
      '/v1/things/: unsupported method _all'
    );
  });

  test('fails loudly on a regular-expression route path', () => {
    const router = Router();
    router.get(/^\/x$/, handler);

    expect(() => listServedOperations([{ mount: '/v1/things', router }])).toThrow(
      '/v1/things: only string route paths are supported'
    );
  });
});

describe('listDocumentedOperations', () => {
  test('lists operations and ignores path-level keys', () => {
    const document: OpenApiDocument = {
      openapi: '3.1.0',
      info: { title: 'Fixture', version: '1.0.0' },
      paths: {
        '/a': { summary: 'A', parameters: [], get: {}, post: {} },
        '/b': { delete: {} },
      },
    };

    expect(listDocumentedOperations(document)).toEqual(['DELETE /b', 'GET /a', 'POST /a']);
  });
});
