import { GenericContainer, StartedTestContainer } from 'testcontainers';
import net from 'node:net';

let emulatorContainer: StartedTestContainer | undefined;

export async function startAuthEmulator(): Promise<void> {
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) return; // assume already running
  const image = 'evolutecx/firebase-emulator:latest';
  const port = 9099;
  const container = new GenericContainer(image)
    .withExposedPorts(port)
    .withEnvironment({ FB_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ?? 'demo-test' });

  emulatorContainer = await container.start();
  const host = emulatorContainer.getHost();
  const mappedPort = emulatorContainer.getMappedPort(port);
  process.env.FIREBASE_AUTH_EMULATOR_HOST = `${host}:${mappedPort}`;

  // Wait until the emulator port is accepting connections to avoid race conditions
  await new Promise<void>((resolve, reject) => {
    const timeoutMs = 15000;
    const start = Date.now();
    const tryConnect = () => {
      const socket = net.createConnection({ host, port: mappedPort });
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
      socket.once('error', (e) => done(e));
      socket.setTimeout(1500, () => done(new Error('timeout')));
    };
    tryConnect();
  });

  // Additionally wait for the HTTP API to be ready, not just the TCP listener
  // This avoids intermittent "socket closed" errors when issuing the first HTTP requests
  const projectId = process.env.FIREBASE_PROJECT_ID ?? 'demo-test';
  const baseUrl = `http://${host}:${mappedPort}`;
  const adminHealthUrl = `${baseUrl}/emulator/v1/projects/${encodeURIComponent(projectId)}/config`;
  const httpReadyTimeoutMs = 15000;
  const httpStart = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const res = await fetch(adminHealthUrl, { method: 'GET' });
      if (res.ok) break;
    } catch {
      // ignore and retry until timeout
    }
    if (Date.now() - httpStart > httpReadyTimeoutMs) {
      throw new Error('Firebase Auth emulator HTTP API did not become ready in time');
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

export async function stopAuthEmulator(): Promise<void> {
  if (emulatorContainer) {
    await emulatorContainer.stop();
  }
}

export async function createUserAndGetIdToken(
  email: string,
  password: string,
  admin = false,
): Promise<string> {
  // Import firebase admin only after global setup has set emulator env vars
  const { configureFirebaseAdmin, getAuth } = await import('../../src/firebase/admin');
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
  const base = `http://${host}/identitytoolkit.googleapis.com/v1`;
  const key = 'any';

  const signupRes = await fetchWithRetry(`${base}/accounts:signUp?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const signupBody = (await signupRes.json()) as { idToken?: string; localId?: string };
  if (!signupRes.ok || !signupBody?.localId) {
    throw new Error('Failed to sign up user in emulator');
  }

  if (admin) {
    // Use Admin SDK against the emulator to set custom claims
    configureFirebaseAdmin();
    await getAuth().setCustomUserClaims(signupBody.localId, { admin: true });
  }

  const signinRes = await fetchWithRetry(`${base}/accounts:signInWithPassword?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const signinBody = (await signinRes.json()) as { idToken?: string };
  if (!signinRes.ok || !signinBody?.idToken) {
    throw new Error('Failed to sign in user in emulator');
  }
  return signinBody.idToken;
}

// Simple fetch with retry to smooth over transient emulator readiness hiccups
async function fetchWithRetry(input: string, init: RequestInit, attempts = 5): Promise<Response> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(input, init);
      // Retry on typical transient failures
      if (!res.ok && res.status >= 500) {
        throw new Error(`HTTP ${res.status}`);
      }
      return res;
    } catch (e) {
      lastErr = e;
      const backoff = 150 * 2 ** (i - 1);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('fetchWithRetry failed');
}
