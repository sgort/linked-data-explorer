#!/usr/bin/env node
// packages/backend/scripts/build-openapi.cjs
//
// Builds openapi/openapi.json and openapi/openapi.v2.json from the hand-written YAML
// beside them (#129).
//
// info.version is taken from package.json here, never written in the YAML, so
// the published document and the API-Version header cannot disagree.
//
// The JSON is generated and gitignored: a committed copy of a generated file is
// a second source waiting to drift. npm runs this before `build` and `dev`, and
// scripts/jest-global-setup.cjs runs it before every Jest run, because CI runs
// the tests before it builds.

const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const PACKAGE_ROOT = path.resolve(__dirname, '..');

// One document per major version: `servers` carry the major version, so the
// v2 routes cannot be described in the v1 document.
const DOCUMENTS = [
  { source: 'openapi.yaml', target: 'openapi.json' },
  { source: 'openapi.v2.yaml', target: 'openapi.v2.json' },
].map(({ source, target }) => ({
  source: path.join(PACKAGE_ROOT, 'openapi', source),
  target: path.join(PACKAGE_ROOT, 'openapi', target),
}));

// Kept for callers that only know the v1 document.
const SOURCE = DOCUMENTS[0].source;
const TARGET = DOCUMENTS[0].target;

function buildOpenApiDocument(source, version) {
  const document = YAML.parse(source);
  if (typeof document !== 'object' || document === null || Array.isArray(document)) {
    throw new Error('openapi.yaml does not contain an object');
  }
  if (document.info && Object.prototype.hasOwnProperty.call(document.info, 'version')) {
    throw new Error('openapi.yaml must not set info.version; it is taken from package.json');
  }
  return { ...document, info: { ...document.info, version } };
}

/** Builds every document and returns the paths written. */
function buildOpenApi() {
  const { version } = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'));
  return DOCUMENTS.map(({ source, target }) => {
    const document = buildOpenApiDocument(fs.readFileSync(source, 'utf8'), version);
    // Write to a temporary file and rename it into place, so a concurrent reader
    // (an overlapping Jest run, or the dev server's first request) never sees
    // half-written JSON.
    const temporary = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`);
    fs.renameSync(temporary, target);
    return target;
  });
}

module.exports = { buildOpenApiDocument, buildOpenApi, DOCUMENTS, SOURCE, TARGET };

if (require.main === module) {
  for (const target of buildOpenApi()) {
    console.log(`Wrote ${path.relative(process.cwd(), target)}`);
  }
}
