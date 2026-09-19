// packages/backend/scripts/jest-env.cjs
//
// Runs before each test file (jest setupFiles), before any module imports
// config.ts. dotenv never overrides a variable that is already set, so pinning
// these here keeps a developer's local .env out of the #142 tests, which assume
// the ACC/PROD defaults (#142).
process.env.ALLOW_LOCAL_ENDPOINTS = 'false';
process.env.TRIPLYDB_ALLOWED_HOSTS = 'api.open-regels.triply.cc';
