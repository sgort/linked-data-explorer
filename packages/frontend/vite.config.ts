import react from '@vitejs/plugin-react';
import path from 'path';
import { loadEnv } from 'vite';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    build: {
      chunkSizeWarningLimit: 1000,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
      dedupe: ['preact', 'preact/hooks', 'preact/compat'],
    },
    test: {
      environment: 'node',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      exclude: [...configDefaults.exclude],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.test.{ts,tsx}', 'src/main.tsx', 'src/vite-env.d.ts', 'src/test/**'],
        // A per-file 80% branch floor, enforced rather than assumed.
        //
        // perFile is the mechanism, not a detail: against the package average
        // (90.59%) the threshold is inert, because one file dropping to 40%
        // barely moves it. Branches specifically, because statement and line
        // coverage largely restate "was this file imported", and an uncovered
        // branch is a decision no test has ever checked.
        //
        // Measured clean when this landed — 64 files, none below 80. But the
        // margin is thin: CaseworkerCasePanel.tsx sits at EXACTLY 80.00, and
        // thirteen more files are between 80 and 85. The first uncovered
        // branch added to any of them turns this red. That is the floor
        // working, not a misconfiguration — but it is worth knowing before
        // someone meets it on an unrelated change.
        //
        // Branches only. A functions floor would fail today; this is not a
        // companion setting to add without measuring first.
        thresholds: {
          branches: 80,
          perFile: true,
        },
      },
    },
  };
});
