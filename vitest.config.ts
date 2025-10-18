import { defineConfig } from 'vitest/config';
import CustomReporter from './tests/setup/reporterSetup';
// rerun cleanup is handled via setup file per-project

export default defineConfig({
  test: {
    // Root defaults only; per-project config lives in vitest.workspace.ts
    environment: 'node',
    globals: true,
    pool: 'forks',
    testTimeout: 60000,
    hookTimeout: 60000,
    setupFiles: [],
    reporters: [],
    // plugins not used; we use setupFiles instead
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.{spec,test}.ts'],
          environment: 'node',
          globals: true,
          pool: 'forks',
          testTimeout: 60000,
          hookTimeout: 60000,
          setupFiles: [],
          globalSetup: [],
          env: {
            TEST_SUITE: 'unit',
          },
        },
      },
      {
        extends: true,
        test: {
          name: 'int',
          include: ['tests/integration/**/*.int.test.ts', 'tests/integration/**/*.test.ts'],
          exclude: [
            'tests/integration/**/*.auth.int.test.ts',
            'tests/integration/**/auth.*.int.test.ts',
            'tests/integration/**/auth.*.test.ts',
          ],
          environment: 'node',
          globals: true,
          pool: 'forks',
          testTimeout: 120000,
          hookTimeout: 120000,
          setupFiles: ['tests/setup/workerDb.ts'],
          globalSetup: ['tests/setup/vitest.global.ts'],
          env: {
          },
        },
      },
      {
        extends: true,
        test: {
          name: 'int-auth',
          include: ['tests/integration/**/*.auth.int.test.ts'],
          environment: 'node',
          globals: true,
          pool: 'forks',
          testTimeout: 120000,
          hookTimeout: 120000,
          setupFiles: ['tests/setup/workerDb.ts'],
          globalSetup: ['tests/setup/vitest.global.ts'],
          env: {
          },
        },
      },
    ],
  },
  resolve: {
    alias: {
      '@tests': 'tests',
    },
  },
});
