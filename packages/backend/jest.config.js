/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  // Report every source file, not just the ones a test happens to import, so
  // untested features surface as 0% instead of being omitted from the table
  // (mirrors ronl-business-api's jest.config.js).
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/types/**',
    '!src/index.ts',
    // Self-executing CLI script (seedRopa().catch(...) + process.exit() at
    // module scope) — not an importable/testable module, matching
    // ronl-business-api's utils/config.ts artifact treatment. migrate.ts is
    // NOT excluded: it exports a plain migrate() function, testable with a
    // mocked pool, just not yet covered.
    '!src/db/seed-ropa.ts',
  ],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          moduleResolution: 'node',
        },
      },
    ],
  },
};
