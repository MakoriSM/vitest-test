import { GenericContainer, Wait } from 'testcontainers';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { startAuthEmulator } from './authEmulator';
import net from 'node:net';

declare global {
  // eslint-disable-next-line no-var
  var __TESTCONTAINERS__: {
    db?: { stop: () => Promise<void> };
    s3?: { stop: () => Promise<void> };
  };
}

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

export default async function globalSetup(): Promise<void> {
  const testSuite = process.env.TEST_SUITE;
  const cliArgs = process.argv.slice(2);
  const cliIsIntegration = cliArgs.some(
    (a) => a.includes('tests/integration') || a.includes('.int.test'),
  );
  const cliNeedsAuth = cliArgs.some((a) => /auth/i.test(a));

  const flagRequireDb = process.env.REQUIRE_DB === 'true';
  const flagRequireS3 = process.env.REQUIRE_S3 === 'true';
  const shouldSetupDb =
    flagRequireDb ||
    testSuite?.startsWith('int') === true ||
    testSuite === 'all' ||
    cliIsIntegration;
  const shouldSetupAuth =
    process.env.AUTH_PROVIDER === 'firebase' ||
    testSuite === 'int-auth' ||
    testSuite === 'all' ||
    cliNeedsAuth;
  const shouldSetupS3 = flagRequireS3 || shouldSetupDb;

  process.env.NODE_ENV = 'test';
  // Ensure PUBLIC_BASE_URL is set so filePathToPublicUrl can construct URLs during tests
  process.env.PUBLIC_BASE_URL ||= 'http://localhost:3000';
  // Speed up testcontainers startup and avoid sidecar
  process.env.TESTCONTAINERS_RYUK_DISABLED ||= 'true';
  process.env.TESTCONTAINERS_CHECKS_DISABLE ||= 'true';

  if (shouldSetupDb) {
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

    const databaseUrl = `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${host}:${port}/${POSTGRES_DB}`;

    process.env.DATABASE_URL = databaseUrl;
    process.env.SHADOW_DATABASE_URL = `${databaseUrl}_shadow`;
    process.env.DB_PROVIDER = 'prisma';

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
    const baseUrl = process.env.DATABASE_URL!; // points to vitest_test
    const toUrlWithDb = (dbName: string) => {
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
    const prevDbUrl = process.env.DATABASE_URL;
    try {
      process.env.DATABASE_URL = templateUrl;
      execWithRetry('npx prisma db push --skip-generate', repoRoot);
    } finally {
      process.env.DATABASE_URL = prevDbUrl;
    }

    // Point base DATABASE_URL to the template for worker consumption
    process.env.DATABASE_URL = templateUrl;

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

    process.env.R2_ENDPOINT = endpoint;
    process.env.R2_ACCESS_KEY_ID ||= 'test';
    process.env.R2_SECRET_ACCESS_KEY ||= 'test';
    process.env.R2_BUCKET ||= 'vitest-test';

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

    global.__TESTCONTAINERS__.s3 = {
      stop: async () => {
        await localstack.stop();
      },
    };
  }

  if (shouldSetupAuth) {
    process.env.AUTH_PROVIDER = 'firebase';
    process.env.FIREBASE_AUTH_EMULATOR = 'true';
    process.env.FIREBASE_PROJECT_ID ||= 'demo-test';
    await startAuthEmulator();
  } else {
    process.env.AUTH_PROVIDER = 'none';
  }
}
