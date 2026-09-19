import react from '@vitejs/plugin-react';
import path from 'path';
import { loadEnv } from 'vite';
import { configDefaults, defineConfig } from 'vitest/config';

import { cspPlugin } from './vite/cspPlugin';

export default defineConfig(({ mode, command }) => {
  // Only meaningful for `vite build`: dev serves no staticwebapp.config.json,
  // and `mode` there is always 'development' regardless of VITE_API_BASE_URL.
  //
  // __dirname (this file's own directory, packages/frontend), not
  // process.cwd(): Vite's own envDir defaults to the config file's
  // directory, and a build run from a different working directory (a root
  // `npm run build --workspace=packages/frontend`, or any repo tooling that
  // cd's elsewhere first) would otherwise read the wrong .env.<mode> file, or
  // none. 'VITE_' as the prefix, not '', so only the variables the built
  // bundle can itself see this way are read -- exactly the ones this file
  // and cspPlugin.ts need.
  const env = loadEnv(mode, __dirname, 'VITE_');

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react(), ...(command === 'build' ? [cspPlugin(env.VITE_API_BASE_URL)] : [])],
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
        // (92.88%) the threshold is inert, because one file dropping to 40%
        // barely moves it. Branches specifically, because statement and line
        // coverage largely restate "was this file imported", and an uncovered
        // branch is a decision no test has ever checked.
        //
        // When this landed, TestCasePanel.tsx sat at EXACTLY 80.00 and thirteen
        // more files were between 80 and 85 — one uncovered branch away from
        // red. (An earlier revision of this comment named the 80.00 file
        // CaseworkerCasePanel.tsx; no such file exists.) Those files have since
        // been given margin: the lowest is now GraphView.tsx at 82.26%.
        //
        // GraphView is where the floor is still tight, and deliberately so.
        // Its eleven uncovered branches are all inside the d3 force-simulation
        // tick and drag handlers — `d.x || 0` position fallbacks and
        // `if (!event.active)` drag guards — which need a running simulation
        // and synthesised drag events to reach. That is a d3 harness, not a
        // test of this component; adding a branch to GraphView will turn this
        // red, and the answer then is to test the new branch, not to lower the
        // floor.
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
