import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    extends: './vitest.config.ts',
    test: {
      name: 'unit',
      include: ['tests/unit/**/*.{test,spec}.ts'],
      globalSetup: ['tests/setup/vitest.global.ts'],
      env: {
        TEST_SUITE: 'unit',
      },
    },
  },
  {
    extends: './vitest.config.ts',
    test: {
      name: 'int',
      include: ['tests/integration/**/*.int.test.ts', 'tests/integration/**/basic.int.test.ts'],
      exclude: [
        'tests/integration/**/*.auth.int.test.ts',
        'tests/integration/**/auth.*.int.test.ts',
        'tests/integration/**/auth.*.test.ts',
      ],
      setupFiles: [],
      globalSetup: [],
      testTimeout: 120000,
      hookTimeout: 120000,
      env: {
        TEST_SUITE: 'int',
        AUTH_PROVIDER: 'none',
        REQUIRE_DB: 'true',
        REQUIRE_S3: 'true',
      },
    },
  },
  {
    extends: './vitest.config.ts',
    test: {
      name: 'int-auth',
      include: ['tests/integration/**/*.auth.int.test.ts', 'tests/integration/auth/**/*.auth.int.test.ts'],
      setupFiles: [],
      globalSetup: [],
      testTimeout: 120000,
      hookTimeout: 120000,
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
]);


