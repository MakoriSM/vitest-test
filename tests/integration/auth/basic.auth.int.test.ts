import request from 'supertest';
import app from '../../../src/app';
import { createUserAndGetIdToken } from '../../setup/authEmulator';
import { expect } from 'vitest';
import { test } from 'vitest';

test('requires auth', async () => {
  const res = await request(app).post('/api/auth/ping');
  expect(res.status).toBe(401);
});

test('accepts emulator token', async () => {
  const token = await createUserAndGetIdToken('user@test.local', 'passw0rd');
  const res = await request(app)
    .post('/api/auth/ping')
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
});


