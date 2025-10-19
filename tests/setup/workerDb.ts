import { beforeAll, expect, inject } from 'vitest';
import { createHash } from 'node:crypto';
import { relative } from 'node:path';
import { adminUrlFromTemplate, createDbFromTemplate } from './dbAdmin';
import { getEnv } from './getEnv';
import { getDatabase, getS3, getAuth } from './testContainers';

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


// No teardown; rerun cleanup handled via reporter

  // Pull desired requirements from provided env first
  process.env.AUTH_PROVIDER = getEnv('AUTH_PROVIDER');
  process.env.FIREBASE_AUTH_EMULATOR = getEnv('FIREBASE_AUTH_EMULATOR');
  process.env.FIREBASE_PROJECT_ID = getEnv('FIREBASE_PROJECT_ID');
  process.env.PUBLIC_BASE_URL = getEnv('PUBLIC_BASE_URL');

  // Lazily initialize containers on first import
  if (process.env.REQUIRE_DB === 'true') {
    console.log('workerDb.ts: REQUIRE_DB === true, getting database');
    await getDatabase(); // sets DATABASE_URL, SHADOW_DATABASE_URL, DB_PROVIDER
  }
  if (process.env.REQUIRE_S3 === 'true') {
    console.log('workerDb.ts: REQUIRE_S3 === true, getting S3');
    await getS3(); // sets R2_* env vars
  }
  if (process.env.REQUIRE_AUTH === 'true') {
    console.log('workerDb.ts: REQUIRE_AUTH === true, getting Auth emulator');
    await getAuth(); // sets FIREBASE_* env vars
  }

  // Fill remaining envs from provided context (if any)
  process.env.DATABASE_URL = process.env.DATABASE_URL || getEnv('DATABASE_URL');
  process.env.SHADOW_DATABASE_URL = process.env.SHADOW_DATABASE_URL || getEnv('SHADOW_DATABASE_URL');
  process.env.DB_PROVIDER = process.env.DB_PROVIDER || getEnv('DB_PROVIDER');
  process.env.R2_ENDPOINT = process.env.R2_ENDPOINT || getEnv('R2_ENDPOINT');
  process.env.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || getEnv('R2_ACCESS_KEY_ID');
  process.env.R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || getEnv('R2_SECRET_ACCESS_KEY');
  process.env.R2_BUCKET = process.env.R2_BUCKET || getEnv('R2_BUCKET');
  process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || getEnv('FIREBASE_AUTH_EMULATOR_HOST');
  process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || getEnv('FIREBASE_PROJECT_ID');

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
