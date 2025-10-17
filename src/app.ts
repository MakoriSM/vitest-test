import express from 'express';
import { prisma } from './prisma/client';
import { putTextObject } from './s3/client';
import { verifyIdTokenIfRequired } from './firebase/admin';

const app = express();
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/auth/ping', verifyIdTokenIfRequired, (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/db', async (req, res) => {
  const data: string = typeof req.body?.data === 'string' ? req.body.data : 'hello';
  const record = await prisma.record.create({ data: { data } });
  res.status(201).json(record);
});

app.post('/api/s3', async (_req, res) => {
  try {
    const key = `k-${Date.now()}.txt`;
    await putTextObject(key, 'hello');
    res.status(201).json({ key });
  } catch (err) {
    res.status(500).json({ error: 's3-failed', message: err instanceof Error ? err.message : String(err) });
  }
});

export default app;


