import crypto from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { verifyTurnstileToken } from './turnstile';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

const configuredOrigins = (
  process.env.WEBAUTHN_ORIGIN || 'https://alunos.leobottaro.com'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const allowedCorsOrigins =
  process.env.FUNCTIONS_EMULATOR === 'true'
    ? [...configuredOrigins, 'http://localhost:5173', 'http://127.0.0.1:5173']
    : configuredOrigins;

function resolveRpContext(req: {
  headers: Record<string, string | string[] | undefined>;
}): { rpID: string; expectedOrigin: string | string[] } | null {
  const originHeader =
    (typeof req.headers.origin === 'string' && req.headers.origin) ||
    configuredOrigins[0] ||
    'https://alunos.leobottaro.com';

  let url: URL;
  try {
    url = new URL(originHeader);
  } catch {
    return null;
  }

  const configuredRpIds = (process.env.WEBAUTHN_RP_ID || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const rpID =
    configuredRpIds.length === 0
      ? url.hostname
      : configuredRpIds.includes(url.hostname)
        ? url.hostname
        : configuredRpIds[0];

  const expectedOrigin =
    allowedCorsOrigins.length === 1 ? allowedCorsOrigins[0] : allowedCorsOrigins;

  return { rpID, expectedOrigin };
}

function getClientIp(req: {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}): string | undefined {
  if (typeof req.headers['cf-connecting-ip'] === 'string') {
    return req.headers['cf-connecting-ip'];
  }
  return req.ip;
}

export const passkeyAuth = onRequest(
  { cors: allowedCorsOrigins },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const rpCtx = resolveRpContext(req);
    if (!rpCtx) {
      res.status(400).json({ error: 'Invalid Origin header.' });
      return;
    }

    const db = getFirestore();
    const auth = getAuth();
    const { rpID, expectedOrigin } = rpCtx;
    const path = req.path.replace(/^\/api\/passkey/, '');
    const remoteIp = getClientIp(req);

    try {
      // Local-dev only: mint a test teacher session without WebAuthn. Disabled
      // unless DEV_LOGIN_SECRET is configured on the function; the fixed UID
      // comes from DEV_LOGIN_UID (default "teacher_dev_test").
      if (path === '/dev/login') {
        const expected = process.env.DEV_LOGIN_SECRET?.trim();
        const provided =
          typeof req.headers['x-dev-login-secret'] === 'string'
            ? req.headers['x-dev-login-secret']
            : '';
        const secretOk =
          Boolean(expected) &&
          provided.length === expected!.length &&
          crypto.timingSafeEqual(
            Buffer.from(provided),
            Buffer.from(expected!)
          );
        if (!secretOk) {
          res.status(404).json({ error: 'Not found' });
          return;
        }

        const uid = (process.env.DEV_LOGIN_UID || 'teacher_dev_test').trim();
        try {
          await auth.getUser(uid);
        } catch {
          await auth.createUser({ uid, displayName: 'Dev Test Teacher' });
        }
        await auth.setCustomUserClaims(uid, { teacher: true });
        const customToken = await auth.createCustomToken(uid, { teacher: true });
        console.log('devLogin issued for', uid);
        res.status(200).json({ customToken, uid });
        return;
      }
      if (path === '/register/options') {
        const turnstileToken =
          req.body?.['cf-turnstile-response'] ?? req.body?.turnstileToken;
        const turnstileOk = await verifyTurnstileToken({
          token: turnstileToken,
          expectedAction: ['teacher_auth', 'teacher_login', 'teacher_register'],
          remoteIp,
        });
        if (!turnstileOk) {
          res.status(403).json({ error: 'Bot verification failed.' });
          return;
        }

        const displayName =
          typeof req.body?.displayName === 'string' && req.body.displayName.trim()
            ? req.body.displayName.trim().slice(0, 80)
            : 'Teacher';

        const uid = `teacher_${crypto.randomUUID()}`;
        const options = await generateRegistrationOptions({
          rpName: 'Class Attendance',
          rpID,
          userID: new TextEncoder().encode(uid),
          userName: displayName,
          userDisplayName: displayName,
          attestationType: 'none',
          authenticatorSelection: {
            residentKey: 'required',
            userVerification: 'required',
          },
        });

        const challengeId = crypto.randomUUID();
        const expiresAt = Date.now() + CHALLENGE_TTL_MS;
        await db.collection('webauthn_challenges').doc(challengeId).set({
          challenge: options.challenge,
          uid,
          displayName,
          kind: 'register',
          expiresAt,
          expireAt: Timestamp.fromMillis(expiresAt),
        });

        res.status(200).json({ challengeId, options });
        return;
      }

      if (path === '/register/verify') {
        const { challengeId, response } = req.body ?? {};
        if (!challengeId || !response) {
          res.status(400).json({ error: 'Missing challengeId or response.' });
          return;
        }

        const challengeRef = db.collection('webauthn_challenges').doc(challengeId);
        const challengeSnap = await challengeRef.get();
        if (!challengeSnap.exists) {
          res.status(400).json({ error: 'Invalid or expired challenge.' });
          return;
        }

        const challengeData = challengeSnap.data()!;
        await challengeRef.delete();

        if (challengeData.kind !== 'register' || Date.now() > challengeData.expiresAt) {
          res.status(400).json({ error: 'Registration challenge expired.' });
          return;
        }

        const verification = await verifyRegistrationResponse({
          response,
          expectedChallenge: challengeData.challenge,
          expectedOrigin,
          expectedRPID: rpID,
          requireUserVerification: true,
        });

        if (!verification.verified || !verification.registrationInfo) {
          res.status(400).json({ error: 'Passkey verification failed.' });
          return;
        }

        const { credential, credentialDeviceType, credentialBackedUp } =
          verification.registrationInfo;

        const uid: string = challengeData.uid;
        // Mint custom token before persisting user/credential records so an IAM
        // failure cannot leave an orphaned credential behind.
        const customToken = await auth.createCustomToken(uid, { teacher: true });

        await auth.createUser({
          uid,
          displayName: challengeData.displayName || 'Teacher',
        });
        await auth.setCustomUserClaims(uid, { teacher: true });

        await db.collection('webauthn_credentials').doc(credential.id).set({
          credentialId: credential.id,
          uid,
          publicKey: Buffer.from(credential.publicKey).toString('base64url'),
          counter: credential.counter,
          transports: credential.transports ?? [],
          credentialDeviceType,
          credentialBackedUp,
          createdAt: Date.now(),
        });

        res.status(200).json({ customToken, uid });
        return;
      }

      if (path === '/login/options') {
        const turnstileToken =
          req.body?.['cf-turnstile-response'] ?? req.body?.turnstileToken;
        const turnstileOk = await verifyTurnstileToken({
          token: turnstileToken,
          expectedAction: ['teacher_auth', 'teacher_login', 'teacher_register'],
          remoteIp,
        });
        if (!turnstileOk) {
          res.status(403).json({ error: 'Bot verification failed.' });
          return;
        }

        const options = await generateAuthenticationOptions({
          rpID,
          userVerification: 'required',
        });

        const challengeId = crypto.randomUUID();
        const expiresAt = Date.now() + CHALLENGE_TTL_MS;
        await db.collection('webauthn_challenges').doc(challengeId).set({
          challenge: options.challenge,
          kind: 'login',
          expiresAt,
          expireAt: Timestamp.fromMillis(expiresAt),
        });

        res.status(200).json({ challengeId, options });
        return;
      }

      if (path === '/login/verify') {
        const { challengeId, response } = req.body ?? {};
        if (!challengeId || !response?.id) {
          res.status(400).json({ error: 'Missing challengeId or assertion.' });
          return;
        }

        const challengeRef = db.collection('webauthn_challenges').doc(challengeId);
        const challengeSnap = await challengeRef.get();
        if (!challengeSnap.exists) {
          res.status(400).json({ error: 'Invalid or expired challenge.' });
          return;
        }

        const challengeData = challengeSnap.data()!;
        await challengeRef.delete();

        if (challengeData.kind !== 'login' || Date.now() > challengeData.expiresAt) {
          res.status(400).json({ error: 'Login challenge expired.' });
          return;
        }

        const credRef = db.collection('webauthn_credentials').doc(response.id);
        const credSnap = await credRef.get();
        if (!credSnap.exists) {
          res.status(401).json({ error: 'Unknown passkey credential.' });
          return;
        }

        const credData = credSnap.data()!;
        const verification = await verifyAuthenticationResponse({
          response,
          expectedChallenge: challengeData.challenge,
          expectedOrigin,
          expectedRPID: rpID,
          requireUserVerification: true,
          credential: {
            id: credData.credentialId,
            publicKey: new Uint8Array(Buffer.from(credData.publicKey, 'base64url')),
            counter: credData.counter ?? 0,
            transports: credData.transports ?? [],
          },
        });

        if (!verification.verified) {
          res.status(401).json({ error: 'Passkey assertion verification failed.' });
          return;
        }

        await credRef.update({
          counter: verification.authenticationInfo.newCounter,
          lastUsedAt: Date.now(),
        });

        const uid: string = credData.uid;
        await auth.setCustomUserClaims(uid, { teacher: true });
        const customToken = await auth.createCustomToken(uid, { teacher: true });
        res.status(200).json({ customToken, uid });
        return;
      }

      res.status(404).json({ error: 'Unknown passkey endpoint.' });
    } catch (err) {
      console.error('passkeyAuth error:', err);
      res.status(500).json({ error: 'Authentication request failed.' });
    }
  }
);
