import fs from 'fs';
import os from 'os';
import path from 'path';
import YAML from 'yaml';

import packageJson from '../../package.json';
import { OPENAPI_JSON_PATH, readOpenApiDocument } from './document';

const YAML_PATH = path.resolve(__dirname, '../../openapi/openapi.yaml');

function readSource() {
  return YAML.parse(fs.readFileSync(YAML_PATH, 'utf8'));
}

describe('the built OpenAPI document', () => {
  test('is openapi.yaml with info.version taken from package.json', () => {
    const source = readSource();

    expect(readOpenApiDocument()).toEqual({
      ...source,
      info: { ...source.info, version: packageJson.version },
    });
  });

  test('is OpenAPI 3.1.0, and the source leaves info.version to the build', () => {
    const source = readSource();

    expect(source.openapi).toBe('3.1.0');
    expect(source.info).not.toHaveProperty('version');
  });

  test('lists only HTTPS servers that carry the major version', () => {
    const { servers } = readOpenApiDocument() as unknown as { servers: { url: string }[] };

    expect(servers.map((server) => server.url)).toEqual([
      'https://backend.linkeddata.open-regels.nl/v1',
      'https://acc.backend.linkeddata.open-regels.nl/v1',
    ]);
  });

  test('is read from the package root, where the deploy artifact places it', () => {
    expect(OPENAPI_JSON_PATH).toBe(path.resolve(__dirname, '../../openapi/openapi.json'));
  });
});

describe('readOpenApiDocument', () => {
  let dir: string;

  beforeEach(() => {
    // One directory per test, so parallel workers never share a file.
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openapi-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function write(content: string): string {
    const file = path.join(dir, 'openapi.json');
    fs.writeFileSync(file, content);
    return file;
  }

  test('throws when the file is missing', () => {
    expect(() => readOpenApiDocument(path.join(dir, 'absent.json'))).toThrow(/ENOENT/);
  });

  test.each([
    ['null', 'null'],
    ['a string', '"openapi"'],
    ['an object without openapi', JSON.stringify({ paths: {} })],
    ['an object without paths', JSON.stringify({ openapi: '3.1.0' })],
  ])('throws when the JSON is %s', (_label, content) => {
    const file = write(content);

    expect(() => readOpenApiDocument(file)).toThrow(`${file} is not an OpenAPI document`);
  });
});
