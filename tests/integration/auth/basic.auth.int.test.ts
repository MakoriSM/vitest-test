import request from 'supertest';
import app from '../../../src/app';
import { createUserAndGetIdToken } from '../../setup/authEmulator';
import { expect } from 'vitest';
import { test } from 'vitest';

test('requires auth', async () => {
  console.log('basic.auth.int.test.ts: DATABASE_URL:', process.env.DATABASE_URL);
  const res = await request(app).post('/api/auth/ping');
  expect(res.status).toBe(401);
});

test('accepts emulator token', async () => {
  console.log('SHADOW_DATABASE_URL:', process.env.SHADOW_DATABASE_URL);
  console.log('DB_PROVIDER:', process.env.DB_PROVIDER);
  console.log('R2_ENDPOINT:', process.env.R2_ENDPOINT);
  console.log('R2_BUCKET:', process.env.R2_BUCKET);
  console.log('R2_ACCESS_KEY_ID:', process.env.R2_ACCESS_KEY_ID);
  console.log('R2_SECRET_ACCESS_KEY:', process.env.R2_SECRET_ACCESS_KEY);
  console.log('FIREBASE_AUTH_EMULATOR_HOST:', process.env.FIREBASE_AUTH_EMULATOR_HOST);
  console.log('FIREBASE_PROJECT_ID:', process.env.FIREBASE_PROJECT_ID);
  console.log('FIREBASE_AUTH_EMULATOR:', process.env.FIREBASE_AUTH_EMULATOR);
  const token = await createUserAndGetIdToken('user@test.local', 'passw0rd');
  const res = await request(app)
    .post('/api/auth/ping')
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
});


