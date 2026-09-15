const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const eslintConfigPrettier = require('eslint-config-prettier');

module.exports = tseslint.config(
  // Base recommended configs
  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  // Prettier compatibility (turns off conflicting rules)
  eslintConfigPrettier,

  // Global ignores
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'logs/**', '*.js', '*.mjs', '*.cjs'],
  },

  // TypeScript-specific configuration
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      // TypeScript-specific rules
      '@typescript-eslint/no-explicit-any': 'warn', // Allow any but warn
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',

      // General rules
      'no-console': 'off', // Allow console in Node.js backend
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
    },
  },

  // Node build scripts (scripts/*.cjs). The '*.cjs' ignore above matches
  // package-root files only, so these are linted, and they run as CommonJS under
  // Node. The globals are named here rather than taken from the `globals`
  // package, which the backend does not declare.
  {
    files: ['scripts/**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        __dirname: 'readonly',
        console: 'readonly',
        process: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // Test-only helpers under src/**/testing/** import dev-only packages (ajv).
  // tsconfig.build.json leaves them out of dist, but tsc follows imports, so a
  // runtime import would compile them back in and fail under --omit=dev.
  {
    files: ['src/**/*.ts'],
    ignores: ['**/*.test.ts', '**/*.spec.ts', 'src/**/testing/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)testing/',
              message: 'Test-only helpers must not be imported by runtime code.',
            },
          ],
        },
      ],
    },
  },

  // Test files - more relaxed rules
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  }
);
