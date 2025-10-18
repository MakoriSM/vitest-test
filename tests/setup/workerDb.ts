import { beforeAll, expect, inject } from 'vitest';
import { createHash } from 'node:crypto';
import { relative } from 'node:path';
import { adminUrlFromTemplate, createDbFromTemplate } from './dbAdmin';
import { getEnv } from './getEnv';

type WorkerGlobals = Record<string, never>;
const WORKER_GLOBALS = globalThis as unknown as WorkerGlobals; // kept for compatibility; unused

function isIntegrationSuite(): boolean {
  const suite = process.env.TEST_SUITE;
  console.log('workerDb.ts: isIntegrationSuite', suite);
  return suite?.startsWith('int') === true || suite === 'all';
}

function toUrlWithDb(baseUrl: string, dbName: string): string {
  const u = new URL(baseUrl);
  u.pathname = `/${dbName}`;
  return u.toString();
}

// No teardown; rerun cleanup handled via plugin

(() => {
  process.env.DATABASE_URL = getEnv('DATABASE_URL');
  process.env.SHADOW_DATABASE_URL = getEnv('SHADOW_DATABASE_URL');
  process.env.DB_PROVIDER = getEnv('DB_PROVIDER');
  process.env.AUTH_PROVIDER = getEnv('AUTH_PROVIDER');
  process.env.FIREBASE_AUTH_EMULATOR = getEnv('FIREBASE_AUTH_EMULATOR');
  process.env.FIREBASE_PROJECT_ID = getEnv('FIREBASE_PROJECT_ID');
  process.env.REQUIRE_DB = getEnv('REQUIRE_DB');
  process.env.REQUIRE_S3 = getEnv('REQUIRE_S3');
  process.env.PUBLIC_BASE_URL = getEnv('PUBLIC_BASE_URL');
  process.env.R2_ENDPOINT = getEnv('R2_ENDPOINT');
  process.env.R2_ACCESS_KEY_ID = getEnv('R2_ACCESS_KEY_ID');
  process.env.R2_SECRET_ACCESS_KEY = getEnv('R2_SECRET_ACCESS_KEY');
  process.env.R2_BUCKET = getEnv('R2_BUCKET');
  process.env.FIREBASE_AUTH_EMULATOR_HOST = getEnv('FIREBASE_AUTH_EMULATOR_HOST');
  process.env.FIREBASE_PROJECT_ID = getEnv('FIREBASE_PROJECT_ID');

  beforeAll(() => {
    const templateUrl = process.env.DATABASE_URL;
    if (!templateUrl) return;

    const testPath = (expect as any).getState?.().testPath as string | undefined;
    if (!testPath) return;

    const rel = relative(process.cwd(), testPath);
    const hash = createHash('sha1').update(rel).digest('hex').slice(0, 10);
    const dbName = `vt_${hash}`;

    const adminUrl = adminUrlFromTemplate(templateUrl);
    createDbFromTemplate(adminUrl, dbName);

    process.env.DATABASE_URL = toUrlWithDb(templateUrl, dbName);
  });
})();
