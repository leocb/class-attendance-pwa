import crypto from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function resolveRpContext(req: {
  headers: Record<string, string | string[] | undefined>;
}) {
  const originHeader =
    (typeof req.headers.origin === 'string' && req.headers.origin) ||
    'https://alunos.leobottaro.com';
  const url = new URL(originHeader);

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

  const configuredOrigins = (process.env.WEBAUTHN_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const expectedOrigin =
    configuredOrigins.length === 0
      ? originHeader
      : configuredOrigins.length === 1
        ? configuredOrigins[0]
        : configuredOrigins;

  return { rpID, expectedOrigin };
}

export const passkeyAuth = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const db = getFirestore();
  const auth = getAuth();
  const { rpID, expectedOrigin } = resolveRpContext(req);
  const path = req.path.replace(/^\/api\/passkey/, '');

  try {
    if (path === '/register/options') {
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
      await db.collection('webauthn_challenges').doc(challengeId).set({
        challenge: options.challenge,
        uid,
        displayName,
        kind: 'register',
        expiresAt: Date.now() + CHALLENGE_TTL_MS,
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
      // Mint the custom token before persisting user/credential records so an IAM
      // signBlob failure does not leave an orphaned credential behind.
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
      const options = await generateAuthenticationOptions({
        rpID,
        userVerification: 'required',
      });

      const challengeId = crypto.randomUUID();
      await db.collection('webauthn_challenges').doc(challengeId).set({
        challenge: options.challenge,
        kind: 'login',
        expiresAt: Date.now() + CHALLENGE_TTL_MS,
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

    res.status(404).json({ error: `Unknown passkey endpoint: ${path}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Passkey auth failed';
    res.status(500).json({ error: message });
  }
});
