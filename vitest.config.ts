import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Root defaults only; per-project config lives in vitest.workspace.ts
    environment: 'node',
    globals: true,
    pool: 'forks',
    testTimeout: 60000,
    hookTimeout: 60000,
    setupFiles: [
      'tests/setup/vitest.global.ts',
      'tests/setup/vitest.global.int.ts',
      'tests/setup/vitest.global.int-auth.ts',
      'tests/setup/workerDb.ts',
    ],
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
          globalSetup: ['tests/setup/vitest.global.ts'],
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
          globalSetup: ['tests/setup/vitest.global.int.ts'],
          env: {
            TEST_SUITE: 'int',
            AUTH_PROVIDER: 'none',
            REQUIRE_DB: 'true',
            REQUIRE_S3: 'true',
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
          globalSetup: ['tests/setup/vitest.global.int-auth.ts'],
          env: {
            TEST_SUITE: 'int-auth',
            AUTH_PROVIDER: 'firebase',
            FIREBASE_AUTH_EMULATOR: 'true',
            FIREBASE_PROJECT_ID: 'demo-test',
            REQUIRE_DB: 'true',
            REQUIRE_S3: 'true',
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
