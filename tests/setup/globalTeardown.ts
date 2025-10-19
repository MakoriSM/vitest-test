import { stopAuthEmulator } from './authEmulator';
import fs from 'node:fs';
import path from 'node:path';
 
export default async function globalTeardown(): Promise<void> {
  console.log('globalTeardown: global.__TESTCONTAINERS__:', global.__TESTCONTAINERS__);
  if (global.__TESTCONTAINERS__?.db) {
    await global.__TESTCONTAINERS__.db.stop();
  }
  if (global.__TESTCONTAINERS__?.s3) {
    await global.__TESTCONTAINERS__.s3.stop();
  }
  // @ts-ignore - optional auth stop handle
  if ((global as any).__TESTCONTAINERS__?.auth) {
    // @ts-ignore
    await (global as any).__TESTCONTAINERS__.auth.stop();
  }
  if (process.env.AUTH_PROVIDER === 'firebase') {
    await stopAuthEmulator();
  }

  // Clean up emitted .int.env file if present
  try {
    const repoRoot = path.resolve(__dirname, '../..');
    const intEnvPath = path.resolve(repoRoot, '.int.env');
    if (fs.existsSync(intEnvPath)) {
      fs.unlinkSync(intEnvPath);
    }
  } catch {
    // ignore cleanup errors
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __TESTCONTAINERS__: {
    db?: { stop: () => Promise<void> };
    s3?: { stop: () => Promise<void> };
    auth?: { stop: () => Promise<void> };
  };
}
