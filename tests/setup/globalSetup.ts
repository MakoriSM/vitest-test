import { GenericContainer, Wait } from 'testcontainers';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { startAuthEmulator } from './authEmulator';
import net from 'node:net';
import type { TestProject } from 'vitest/node';
import { setEnv } from './utils';

async function waitForPort(host: string, port: number, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  const tryOnce = () =>
    new Promise<void>((resolve, reject) => {
      const socket = net.createConnection({ host, port });
      const done = (err?: Error) => {
        socket.destroy();
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      };
      socket.once('connect', () => done());
      socket.once('error', (e) => done(e));
      socket.setTimeout(1500, () => done(new Error('timeout')));
    });

  let lastErr: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      await tryOnce();
      return;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('port never became ready');
}

function execWithRetry(cmd: string, cwd: string, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try {
      execSync(cmd, { stdio: 'inherit', cwd, env: process.env });
      return;
    } catch (e) {
      if (i === attempts) throw e;
      const backoff = 300 * 2 ** (i - 1);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, backoff); // sleep
    }
  }
}

export default async function globalSetup(project: TestProject, shouldSetupDb: boolean, shouldSetupS3: boolean, shouldSetupAuth: boolean): Promise<GlobalContext> {

  process.env.NODE_ENV = 'test';
  // Ensure PUBLIC_BASE_URL is set so filePathToPublicUrl can construct URLs during tests
  process.env.PUBLIC_BASE_URL ||= 'http://localhost:3000';
  // Speed up testcontainers startup and avoid sidecar
  process.env.TESTCONTAINERS_RYUK_DISABLED ||= 'true';
  process.env.TESTCONTAINERS_CHECKS_DISABLE ||= 'true';

  let provideDb: { templateUrl: string; adminUrl: string; templateDb: string } | undefined;
  let provideS3:
    | { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string }
    | undefined;
  let provideAuth: { emulatorHost: string; projectId: string } | undefined;

  if (shouldSetupDb) {
    console.log('globalSetup.ts: shouldSetupDb', shouldSetupDb);
    const postgresImage = 'postgres:16-alpine';
    const POSTGRES_USER = 'postgres';
    const POSTGRES_PASSWORD = 'password';
    const POSTGRES_DB = 'vitest_test';

    const container = await new GenericContainer(postgresImage)
      .withEnvironment({
        POSTGRES_USER,
        POSTGRES_PASSWORD,
        POSTGRES_DB,
        // Faster initdb on ephemeral test DB
        POSTGRES_INITDB_ARGS: '--no-sync',
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections'))
      .start();

    const host = container.getHost();
    const port = container.getMappedPort(5432);

    let databaseUrl = `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${host}:${port}/${POSTGRES_DB}`;
    console.log('globalSetup.ts: databaseUrl', databaseUrl);

    setEnv(project, 'DATABASE_URL', databaseUrl);
    setEnv(project, 'SHADOW_DATABASE_URL', `${databaseUrl}_shadow`);
    setEnv(project, 'DB_PROVIDER', 'prisma');

    await waitForPort(host, port);

    const repoRoot = path.resolve(__dirname, '../..');
    // Generate Prisma client only if missing to avoid redundant work
    const prismaClientJs = path.resolve(repoRoot, 'node_modules/.prisma/client/index.js');
    if (!fs.existsSync(prismaClientJs)) {
      execWithRetry('npm run prisma:generate', repoRoot);
    }

    // Prepare a single template database with the Prisma schema for fast worker cloning
    const templateDb = 'vitest_template';

    // Build URLs
    const baseUrl = databaseUrl; // points to vitest_test
    const toUrlWithDb = (dbName: string) => {
      console.log('globalSetup.ts: toUrlWithDb', baseUrl, dbName);
      const u = new URL(baseUrl);
      u.pathname = `/${dbName}`;
      return u.toString();
    };
    const adminUrl = toUrlWithDb('postgres');
    const templateUrl = toUrlWithDb(templateDb);

    // Use Prisma to wait for readiness and create template DB (avoids psql flakiness)
    const { PrismaClient } = await import('@prisma/client');
    const adminPrisma = new PrismaClient({ datasources: { db: { url: adminUrl } } });
    try {
      // Wait until server accepts queries
      for (let i = 0; i < 15; i++) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await adminPrisma.$queryRaw`SELECT 1`;
          break;
        } catch {
          if (i === 14) throw new Error('database not accepting queries');
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 300));
        }
      }

      const exists =
        (await adminPrisma.$queryRaw`SELECT 1 FROM pg_database WHERE datname = ${templateDb}`) as Array<unknown>;
      if (exists.length === 0) {
        await adminPrisma.$executeRawUnsafe(
          `CREATE DATABASE "${templateDb}" WITH TEMPLATE template0`,
        );
      }
    } finally {
      await adminPrisma.$disconnect();
    }

    // Push Prisma schema into the template database
    const prevDbUrl = databaseUrl;
    try {
      databaseUrl = templateUrl;
      execWithRetry('npx prisma db push --skip-generate', repoRoot);
    } finally {
      databaseUrl = prevDbUrl;
    }

    // Point base DATABASE_URL to the template for worker consumption
    project.provide('DATABASE_URL', templateUrl);
    provideDb = { templateUrl, adminUrl, templateDb };

    global.__TESTCONTAINERS__ = {
      db: {
        stop: async () => {
          await container.stop();
        },
      },
    };
  } else {
    global.__TESTCONTAINERS__ = {};
  }

  // Start LocalStack S3 for integration tests
  if (shouldSetupS3) {
    const localstack = await new GenericContainer('localstack/localstack:2.3')
      .withEnvironment({
        SERVICES: 's3',
        EDGE_PORT: '4566',
        DEBUG: '1',
      })
      .withExposedPorts(4566)
      .withWaitStrategy(Wait.forLogMessage('Ready.'))
      .start();

    const host = localstack.getHost();
    const port = localstack.getMappedPort(4566);
    const endpoint = `http://${host}:${port}`;
    console.log('globalSetup.ts: endpoint', endpoint);

    project.provide('R2_ENDPOINT', endpoint);
    project.provide('R2_ACCESS_KEY_ID', 'test');
    project.provide('R2_SECRET_ACCESS_KEY', 'test');
    project.provide('R2_BUCKET', 'vitest-test');

    // Create bucket using AWS SDK v3
    const { S3Client, CreateBucketCommand } = await import('@aws-sdk/client-s3');
    const setupS3 = new S3Client({
      region: 'us-east-1',
      endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
    try {
      await setupS3.send(new CreateBucketCommand({ Bucket: process.env.R2_BUCKET! }));
    } catch {
      // Ignore if bucket already exists
    }

    provideS3 = {
      endpoint,
      bucket: process.env.R2_BUCKET!,
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    };

    global.__TESTCONTAINERS__.s3 = {
      stop: async () => {
        await localstack.stop();
      },
    };
  }

  if (shouldSetupAuth) {
    setEnv(project, 'AUTH_PROVIDER', 'firebase');
    setEnv(project, 'FIREBASE_AUTH_EMULATOR', 'true');
    setEnv(project, 'FIREBASE_PROJECT_ID', 'demo-test');
    await startAuthEmulator(project);
    if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
      provideAuth = {
        emulatorHost: process.env.FIREBASE_AUTH_EMULATOR_HOST,
        projectId: process.env.FIREBASE_PROJECT_ID!,
      };
    }
  } else {
    setEnv(project, 'AUTH_PROVIDER', 'none');
  }

  // Provide dynamic infrastructure details to workers
  const context = {
    db: provideDb,
    s3: provideS3,
    auth: provideAuth,
  };
  return context;
}

export interface GlobalContext {
  db?: { templateUrl: string; adminUrl: string; templateDb: string };
  s3?: { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string };
  auth?: { emulatorHost: string; projectId: string };
}