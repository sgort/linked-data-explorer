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
  // A per-file 80% branch floor, enforced rather than assumed.
  //
  // A GLOB key, not `global`. Jest applies a glob threshold to each matching
  // file individually; a package-wide average (92.22% here) is precisely what
  // hides one file falling off a cliff.
  //
  // Branches specifically: statement and line coverage largely restate "was
  // this file imported", function coverage rewards splitting code into more
  // functions, and an uncovered branch is a decision no test has ever checked.
  //
  // Measured clean when this landed — 49 files, none below 80, lowest
  // sparql.service.ts at 82.85. More margin than the frontend has.
  //
  // This gates pull requests only because azure-backend-acc.yml gained a
  // pull_request trigger in the same change (#46). Before that the suite ran
  // after the merge, so a threshold here would have failed on acc rather than
  // on the branch that caused it.
  coverageThreshold: {
    './src/**/*.ts': {
      branches: 80,
    },
  },
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
