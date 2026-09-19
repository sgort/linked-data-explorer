// packages/backend/src/openapi/testing/conformance.ts
//
// Test helper: assert that a real response matches what the OpenAPI document
// describes for that operation (#129). Route tests call it, so a handler change
// that alters a response shape fails the handler's own test, not only later, in
// a client, against a document that quietly stopped being true.
//
// Never loaded at runtime. It lives under src/ so it is type-checked, linted and
// held to the branch-coverage floor like everything else.

import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import type { Response } from 'supertest';

import { OpenApiDocument, readOpenApiDocument } from '../document';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

interface MediaTypeObject {
  schema?: unknown;
}

interface ResponseObject {
  content?: Record<string, MediaTypeObject>;
}

interface OperationObject {
  responses?: Record<string, ResponseObject>;
}

/**
 * OpenAPI refers to shared schemas as #/components/schemas/X. Compiled as one
 * standalone JSON Schema, they sit under $defs, so the references move with them.
 */
function toJsonSchema(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value).split('#/components/schemas/').join('#/$defs/'));
}

function isJson(contentType: string): boolean {
  return contentType === 'application/json' || contentType.endsWith('+json');
}

export function expectToMatchOperation(
  res: Response,
  method: HttpMethod,
  path: string,
  document: OpenApiDocument = readOpenApiDocument()
): void {
  const label = `${method.toUpperCase()} ${path}`;

  const operation = document.paths[path]?.[method] as OperationObject | undefined;
  if (!operation) throw new Error(`${label} is not documented`);

  const responses = operation.responses ?? {};
  const response = responses[String(res.status)] ?? responses.default;
  if (!response) throw new Error(`${label} does not document status ${res.status}`);

  // /core/version-header: every successful response carries the version.
  if (String(res.status).startsWith('2') && res.headers['api-version'] === undefined) {
    throw new Error(`${label} answered ${res.status} without the API-Version header`);
  }

  const content = response.content ?? {};
  const documentedTypes = Object.keys(content);
  if (documentedTypes.length === 0) return;

  const contentType = String(res.headers['content-type'] ?? '')
    .split(';')[0]
    .trim();
  const media = content[contentType];
  if (!media) {
    throw new Error(
      `${label} answered ${res.status} with ${contentType || 'no content type'}; ` +
        `documented: ${documentedTypes.join(', ')}`
    );
  }
  if (media.schema === undefined) return;

  // strictSchema stays on, so a misspelled keyword in the document fails loudly.
  // These four are OpenAPI 3.1 schema keywords that JSON Schema 2020-12 lacks.
  const ajv = new Ajv2020({ allErrors: true, strictTypes: false, strictTuples: false });
  ajv.addVocabulary(['example', 'discriminator', 'xml', 'externalDocs']);
  addFormats(ajv);

  const validate = ajv.compile({
    ...(toJsonSchema(media.schema) as Record<string, unknown>),
    $defs: toJsonSchema(document.components?.schemas ?? {}),
  });

  const body: unknown = isJson(contentType) ? res.body : res.text;
  if (!validate(body)) {
    throw new Error(
      `${label} answered ${res.status} with a body that does not match the document:\n` +
        ajv.errorsText(validate.errors, { separator: '\n' })
    );
  }
}
