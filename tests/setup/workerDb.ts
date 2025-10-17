import { execSync } from 'node:child_process';

type WorkerGlobals = {
  WORKER_DB_READY?: boolean;
  WORKER_SCHEMA?: string;
};

const WORKER_GLOBALS = globalThis as unknown as WorkerGlobals;

function isIntegrationSuite(): boolean {
  const suite = process.env.TEST_SUITE;
  return suite?.startsWith('int') === true || suite === 'all';
}

function toUrlWithDb(baseUrl: string, dbName: string): string {
  const u = new URL(baseUrl);
  u.pathname = `/${dbName}`;
  return u.toString();
}

function registerDatabaseTeardown(workerDb: string, adminUrl: string): void {
  const drop = () => {
    try {
      // Terminate connections to the worker DB to allow drop
      execSync(
        `psql "${adminUrl}" -v ON_ERROR_STOP=1 -c 'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${workerDb}' AND pid <> pg_backend_pid()'`,
        { stdio: 'ignore' },
      );
      execSync(`psql "${adminUrl}" -v ON_ERROR_STOP=1 -c 'DROP DATABASE IF EXISTS "${workerDb}"'`, {
        stdio: 'ignore',
      });
    } catch {
      // Best effort; ignore teardown errors
    }
  };

  const once = () => {
    process.once('exit', () => {
      drop();
    });
    process.once('SIGINT', () => {
      drop();
      process.exit(130);
    });
    process.once('SIGTERM', () => {
      drop();
      process.exit(143);
    });
  };

  once();
}

(() => {
  // Only run in integration suites and when a database is provisioned by global setup
  if (!isIntegrationSuite()) return;
  if (WORKER_GLOBALS.WORKER_DB_READY) return;

  const templateUrl = process.env.DATABASE_URL;
  if (!templateUrl) return;

  const workerDb = `vitest_w${process.pid}`;
  const adminUrl = toUrlWithDb(templateUrl, 'postgres');

  // Create a database cloned from the template prepared by globalSetup (sync)
  try {
    execSync(
      `psql "${adminUrl}" -v ON_ERROR_STOP=1 -c 'CREATE DATABASE "${workerDb}" TEMPLATE vitest_template'`,
      { stdio: 'ignore' },
    );
  } catch {
    // ignore if exists
  }

  // Point worker's DATABASE_URL to its dedicated database
  const workerUrl = toUrlWithDb(templateUrl, workerDb);
  process.env.DATABASE_URL = workerUrl;

  WORKER_GLOBALS.WORKER_DB_READY = true;
  WORKER_GLOBALS.WORKER_SCHEMA = workerDb;

  // Ensure database is dropped when the worker exits
  registerDatabaseTeardown(workerDb, adminUrl);
})();
