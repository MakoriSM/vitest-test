import globalSetup from './globalSetup';
import globalTeardown from './globalTeardown';

export default async function setup() {
  process.env.NODE_ENV = 'test';
  process.env.TEST_SUITE = 'int';
  process.env.AUTH_PROVIDER = 'none';
  process.env.REQUIRE_DB = 'true';
  process.env.REQUIRE_S3 = 'true';
  await import('./loadIntEnv');
  await globalSetup();
  return async () => {
    await globalTeardown();
  };
}
