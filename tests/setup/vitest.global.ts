import type { TestProject } from 'vitest/node';
import globalSetup from './globalSetup';
import { setEnv } from './utils';
import globalTeardown from './globalTeardown';

export default async function setup(project: TestProject) {
  setEnv(project, 'TEST_SUITE', 'int-auth');
  await globalSetup(project, true, true, true);
  project.onTestsRerun(async () => {
    setEnv(project, 'TEST_SUITE', 'int-auth');
    await globalSetup(project, true, true, true);
    return new Promise<void>(async (resolve) => {
      await globalTeardown();
      resolve();
    });
  });
  return async () => {
    return new Promise<void>(async (resolve) => {
      console.log('vitest.global.ts: teardown');
      await globalTeardown();
      resolve();
    });
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    NODE_ENV: string;
    TEST_SUITE: string;
    AUTH_PROVIDER: string;
    FIREBASE_AUTH_EMULATOR: string;
    FIREBASE_PROJECT_ID: string;
    REQUIRE_DB: string;
    REQUIRE_S3: string;
    DATABASE_URL: string;
    SHADOW_DATABASE_URL: string;
    DB_PROVIDER: string;
    PUBLIC_BASE_URL: string;
    R2_ENDPOINT: string;
    R2_ACCESS_KEY_ID: string;
    R2_SECRET_ACCESS_KEY: string;
    R2_BUCKET: string;
  }
}