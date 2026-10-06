// packages/backend/src/openapi/document.ts
//
// The published OpenAPI description (#129). Written by hand in
// openapi/openapi.yaml and built to openapi/openapi.json by
// scripts/build-openapi.cjs. This module only reads the JSON, so the YAML
// parser stays a development dependency.

import fs from 'fs';
import path from 'path';

/**
 * <package root>/openapi/openapi.json: packages/backend/ from src/openapi, and
 * deploy/ from dist/openapi in the artifact. The same relative step resolves
 * package.json, build-info.json and shapes/.
 */
export const OPENAPI_JSON_PATH = path.resolve(__dirname, '../../openapi/openapi.json');

/** The v2 routes' document, built from openapi/openapi.v2.yaml beside it. */
export const OPENAPI_V2_JSON_PATH = path.resolve(__dirname, '../../openapi/openapi.v2.json');

export interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string; [key: string]: unknown };
  paths: Record<string, Record<string, unknown>>;
  components?: { schemas?: Record<string, unknown>; [key: string]: unknown };
  [key: string]: unknown;
}

/** Throws when the file is missing or does not hold an OpenAPI document. */
export function readOpenApiDocument(file: string = OPENAPI_JSON_PATH): OpenApiDocument {
  const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('openapi' in parsed) ||
    !('paths' in parsed)
  ) {
    throw new Error(`${file} is not an OpenAPI document`);
  }

  return parsed as OpenApiDocument;
}

/** The v2 document; same checks as readOpenApiDocument. */
export function readOpenApiV2Document(): OpenApiDocument {
  return readOpenApiDocument(OPENAPI_V2_JSON_PATH);
}
