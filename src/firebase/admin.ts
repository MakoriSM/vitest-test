import { NextFunction, Request, Response } from 'express';
import { initializeApp, applicationDefault, cert, getApps } from 'firebase-admin/app';
import admin from 'firebase-admin';
import { getAuth } from 'firebase-admin/auth';

export function configureFirebaseAdmin(): void {
  if (getApps().length > 0) return;
  // Prefer emulator when configured
  if (process.env.FIREBASE_AUTH_EMULATOR) {
    initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
    return;
  }
  if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PROJECT_ID) {
    const serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };
    initializeApp({
      credential: cert(serviceAccount),
    });
  } else {
    initializeApp({ credential: applicationDefault() });
  }
}

export { getAuth };

export async function verifyIdTokenIfRequired(req: Request, res: Response, next: NextFunction) {
  const provider = process.env.AUTH_PROVIDER ?? 'none';
  if (provider !== 'firebase') return next();
  configureFirebaseAdmin();

  const authHeader = req.header('authorization') || req.header('Authorization');
  if (!authHeader) return res.status(401).json({ error: 'Missing Authorization header' });
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ error: 'Invalid Authorization header' });
  const token = match[1];
  try {
    await admin.auth().verifyIdToken(token, true);
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}