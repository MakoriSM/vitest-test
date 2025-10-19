import { exec as _exec } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import fs from 'node:fs';
import { GenericContainer, Wait } from 'testcontainers';

const exec = promisify(_exec);

type StopHandle = { stop: () => Promise<void> };

async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const lockDir = path.join(os.tmpdir(), `vitest-testcontainers-lock-${key}`);
    for (let i = 0; i < 200; i++) {
      try {
        await fs.promises.mkdir(lockDir);
        break;
      } catch (e: any) {
        if (e?.code === 'EEXIST' || e?.code === 'EACCES') {
          await new Promise((r) => setTimeout(r, 75));
          continue;
        }
        throw e;
      }
    }
    try {
      return await fn();
    } finally {
      await fs.promises.rm(lockDir, { recursive: true, force: true }).catch(() => {});
    }
  }

async function findContainerIdByLabel(labelKey: string, labelValue: string): Promise<string | undefined> {
  try {
    const { stdout } = await exec(`docker ps -q --filter "label=${labelKey}=${labelValue}"`);
    const id = stdout.trim().split('\n').filter(Boolean)[0];
    return id;
  } catch {
    return undefined;
  }
}

async function inspectContainer(containerId: string): Promise<any | undefined> {
  try {
    const { stdout } = await exec(`docker inspect ${containerId}`);
    const arr = JSON.parse(stdout);
    return Array.isArray(arr) ? arr[0] : undefined;
  } catch {
    return undefined;
  }
}

function getHostPortFromInspect(inspect: any, containerPort: number): string | undefined {
  const key = `${containerPort}/tcp`;
  const ports = inspect?.NetworkSettings?.Ports;
  const bindings = ports?.[key];
  const hostPort = Array.isArray(bindings) && bindings.length > 0 ? bindings[0]?.HostPort : undefined;
  return hostPort;
}

async function ensurePrismaTemplateDb(adminUrl: string, templateUrl: string, templateDb: string): Promise<void> {
  // Generate Prisma client if missing to avoid runtime import errors
  const repoRoot = path.resolve(__dirname, '../..');
  const prismaClientJs = path.resolve(repoRoot, 'node_modules/.prisma/client/index.js');
  if (!fs.existsSync(prismaClientJs)) {
    try {
      await exec('npm run prisma:generate', { cwd: repoRoot, env: process.env });
    } catch {
      // ignore; tests may still pass if client already present elsewhere
    }
  }

  const { PrismaClient } = await import('@prisma/client');
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  try {
    // Wait until server accepts queries
    for (let i = 0; i < 20; i++) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await admin.$queryRaw`SELECT 1`;
        break;
      } catch {
        if (i === 19) throw new Error('database not accepting queries');
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    const exists = (await admin.$queryRaw`SELECT 1 FROM pg_database WHERE datname = ${templateDb}`) as unknown[];
    if (exists.length === 0) {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${templateDb}" WITH TEMPLATE template0`);
    }
  } finally {
    await admin.$disconnect();
  }

  // Push Prisma schema into the template database
  try {
    await exec('npx prisma db push --skip-generate', {
      cwd: repoRoot,
      env: { ...process.env, DATABASE_URL: templateUrl },
    });
  } catch {
    // ignore; if schema already present this can fail harmlessly
  }
}

export async function getDatabase(): Promise<{ templateUrl: string; adminUrl: string }> {
  console.log('getDatabase: starting');
  const LABEL_KEY = 'vitest-test';
  const LABEL_VAL = 'postgres';
  const POSTGRES_USER = 'postgres';
  const POSTGRES_PASSWORD = 'password';
  const BASE_DB = 'vitest_test';
  const TEMPLATE_DB = 'vitest_template';

  let host = '127.0.0.1';
  let mapped = '';
  let startedContainer: { stop: () => Promise<void> } | undefined;

  await withLock('postgres', async () => {
  const existingId = await findContainerIdByLabel(LABEL_KEY, LABEL_VAL);
  if (existingId) {
    console.log('getDatabase: existingId found', existingId);
    const inspect = await inspectContainer(existingId);
    const hostPort = inspect ? getHostPortFromInspect(inspect, 5432) : undefined;
    if (!hostPort) throw new Error('Found postgres container but no mapped port');
    mapped = hostPort;
    // Provide a stop handle using Docker CLI; removes even if we didn't start it
    startedContainer = {
      stop: async () => {
        try {
          await exec(`docker rm -f ${existingId}`);
        } catch {
          // ignore
        }
      },
    };
  } else {
    console.log('getDatabase: no existingId found, starting new container');
    const container = await new GenericContainer('postgres:16-alpine')
      .withEnvironment({
        POSTGRES_USER,
        POSTGRES_PASSWORD,
        POSTGRES_DB: BASE_DB,
        POSTGRES_INITDB_ARGS: '--no-sync',
      })
      .withExposedPorts(5432)
      .withLabels({ [LABEL_KEY]: LABEL_VAL })
      .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections'))
      .start();

    host = container.getHost();
    mapped = String(container.getMappedPort(5432));
    startedContainer = { stop: async () => void await container.stop() };
  }
});

  const baseUrl = `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${host}:${mapped}/${BASE_DB}`;
  const adminUrl = `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${host}:${mapped}/postgres`;
  const templateUrl = `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${host}:${mapped}/${TEMPLATE_DB}`;

  // Ensure template schema exists
  await ensurePrismaTemplateDb(adminUrl, templateUrl, TEMPLATE_DB);

  // Expose to environment for tests
  process.env.DATABASE_URL = templateUrl;
  process.env.SHADOW_DATABASE_URL = `${templateUrl}_shadow`;
  process.env.DB_PROVIDER = 'prisma';

  // Register global stop handle (create if missing)
  global.__TESTCONTAINERS__ = global.__TESTCONTAINERS__ || {};
  global.__TESTCONTAINERS__.db = startedContainer;

  return { templateUrl, adminUrl };
}

export async function getS3(): Promise<{ endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string }> {
  const LABEL_KEY = 'vitest-test';
  const LABEL_VAL = 's3';

  let host = '127.0.0.1';
  let mapped = '';
  let startedContainer: { stop: () => Promise<void> } | undefined;

  const existingId = await findContainerIdByLabel(LABEL_KEY, LABEL_VAL);
  if (existingId) {
    const inspect = await inspectContainer(existingId);
    const hostPort = inspect ? getHostPortFromInspect(inspect, 4566) : undefined;
    if (!hostPort) throw new Error('Found localstack container but no mapped port');
    mapped = hostPort;
    startedContainer = {
      stop: async () => {
        try {
          await exec(`docker rm -f ${existingId}`);
        } catch {
          // ignore
        }
      },
    };
  } else {
    const localstack = await new GenericContainer('localstack/localstack:2.3')
      .withEnvironment({ SERVICES: 's3', EDGE_PORT: '4566', DEBUG: '1' })
      .withExposedPorts(4566)
      .withLabels({ [LABEL_KEY]: LABEL_VAL })
      .withWaitStrategy(Wait.forLogMessage('Ready.'))
      .start();

    host = localstack.getHost();
    mapped = String(localstack.getMappedPort(4566));
    startedContainer = { stop: async () => void await localstack.stop() };
  }

  const endpoint = `http://${host}:${mapped}`;

  // Expose to environment
  process.env.R2_ENDPOINT = endpoint;
  process.env.R2_ACCESS_KEY_ID = 'test';
  process.env.R2_SECRET_ACCESS_KEY = 'test';
  process.env.R2_BUCKET = process.env.R2_BUCKET || 'vitest-test';

  // Ensure bucket exists
  try {
    const { S3Client, CreateBucketCommand } = await import('@aws-sdk/client-s3');
    const s3 = new S3Client({
      region: 'us-east-1',
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
    });
    await s3.send(new CreateBucketCommand({ Bucket: process.env.R2_BUCKET! }));
  } catch {
    // ignore if already exists
  }

  // Register global stop handle
  global.__TESTCONTAINERS__ = global.__TESTCONTAINERS__ || {};
  global.__TESTCONTAINERS__.s3 = startedContainer;

  return {
    endpoint,
    bucket: process.env.R2_BUCKET!,
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  };
}

export async function getAuth(): Promise<{ emulatorHost: string; projectId: string }> {
  const LABEL_KEY = 'vitest-test';
  const LABEL_VAL = 'auth';
  const IMAGE = 'evolutecx/firebase-emulator:latest';
  const PORT = 9099;
  const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'demo-test';

  let host = '127.0.0.1';
  let mapped = '';
  let startedContainer: { stop: () => Promise<void> } | undefined;

  await withLock('auth', async () => {
    const existingId = await findContainerIdByLabel(LABEL_KEY, LABEL_VAL);
    if (existingId) {
      const inspect = await inspectContainer(existingId);
      const hostPort = inspect ? getHostPortFromInspect(inspect, PORT) : undefined;
      if (!hostPort) throw new Error('Found auth emulator container but no mapped port');
      mapped = hostPort;
      startedContainer = {
        stop: async () => {
          try {
            await exec(`docker rm -f ${existingId}`);
          } catch {
            // ignore
          }
        },
      };
      return;
    }

    const container = await new GenericContainer(IMAGE)
      .withExposedPorts(PORT)
      .withEnvironment({ FB_PROJECT_ID: PROJECT_ID })
      .withLabels({ [LABEL_KEY]: LABEL_VAL })
      .start();

    host = container.getHost();
    mapped = String(container.getMappedPort(PORT));
    startedContainer = { stop: async () => void await container.stop() };
  });

  const emulatorHost = `${host}:${mapped}`;

  // Wait for TCP readiness
  await new Promise<void>((resolve, reject) => {
    const timeoutMs = 15000;
    const start = Date.now();
    const tryConnect = () => {
      const socket = net.createConnection({ host, port: Number(mapped) });
      const done = (err?: Error) => {
        socket.destroy();
        if (err) {
          if (Date.now() - start > timeoutMs) {
            reject(err);
          } else {
            setTimeout(tryConnect, 300);
          }
        } else {
          resolve();
        }
      };
      socket.once('connect', () => done());
      socket.once('error', (e: unknown) => done(e as Error | undefined));
      socket.setTimeout(1500, () => done(new Error('timeout')));
    };
    tryConnect();
  });

  // Wait for HTTP API readiness
  const baseUrl = `http://${emulatorHost}`;
  const adminHealthUrl = `${baseUrl}/emulator/v1/projects/${encodeURIComponent(PROJECT_ID)}/config`;
  const httpReadyTimeoutMs = 15000;
  const httpStart = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const res = await fetch(adminHealthUrl, { method: 'GET' });
      if ((res as any)?.ok) break;
    } catch {
      // ignore
    }
    if (Date.now() - httpStart > httpReadyTimeoutMs) {
      throw new Error('Firebase Auth emulator HTTP API did not become ready in time');
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  // Expose to environment
  process.env.AUTH_PROVIDER = 'firebase';
  process.env.FIREBASE_AUTH_EMULATOR = 'true';
  process.env.FIREBASE_PROJECT_ID = PROJECT_ID;
  console.log('getAuth: PROJECT_ID', process.env.FIREBASE_PROJECT_ID);
  process.env.FIREBASE_AUTH_EMULATOR_HOST = emulatorHost;
  console.log('getAuth: emulatorHost', process.env.FIREBASE_AUTH_EMULATOR_HOST);

  // Register global stop handle
  global.__TESTCONTAINERS__ = global.__TESTCONTAINERS__ || {};
  global.__TESTCONTAINERS__.auth = startedContainer;

  return { emulatorHost, projectId: PROJECT_ID };
}


