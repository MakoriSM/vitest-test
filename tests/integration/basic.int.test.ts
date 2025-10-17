import request from 'supertest';
import app from '../../src/app';
import { expect } from 'vitest';
import { test } from 'vitest';

test('DB create works', async () => {
  const res = await request(app).post('/api/db').send({ data: 'x' });
  console.log(res);
  expect(res.status).toBe(201);
  expect(typeof res.body.id).toBe('string');
});

test('S3 upload works', async () => {
  const res = await request(app).post('/api/s3');
  console.log(res);
  expect(res.status).toBe(201);
  expect(typeof res.body.key).toBe('string');
});


