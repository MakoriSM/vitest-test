import globalSetup from './globalSetup';
import globalTeardown from './globalTeardown';

export default async function setup() {
  process.env.NODE_ENV = 'test';
  process.env.TEST_SUITE = 'int-auth';
  process.env.AUTH_PROVIDER = 'firebase';
  process.env.FIREBASE_AUTH_EMULATOR = 'true';
  process.env.FIREBASE_PROJECT_ID = 'demo-test';
  process.env.REQUIRE_DB = 'true';
  process.env.REQUIRE_S3 = 'true';
  // Load optional .int.env (API keys, etc.) before starting services
  await import('./loadIntEnv');
  await globalSetup();
  return async () => {
    await globalTeardown();
  };
}
