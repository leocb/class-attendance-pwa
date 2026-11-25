import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import {
  computeFingerprintFromJwk,
  isTimestampFresh,
  qrPayloadSchema,
  verifyQrSignature,
} from './crypto';
import { downloadAndVerifySelfieFromStorage } from './storageHelper';

const requestSchema = z.object({
  qrPayload: qrPayloadSchema,
  classId: z.string().min(1),
});

export const getRotationSelfie = onCall(async (request) => {
  if (!request.auth || request.auth.token.teacher !== true) {
    throw new HttpsError(
      'permission-denied',
      'Only authenticated teachers can inspect rotation selfies.'
    );
  }

  const parsed = requestSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Malformed rotation payload.');
  }

  const { qrPayload, classId } = parsed.data;
  if (!qrPayload.pk) {
    throw new HttpsError(
      'invalid-argument',
      'Rotation QR must include the new public key.'
    );
  }

  if (!isTimestampFresh(qrPayload.ts)) {
    throw new HttpsError(
      'failed-precondition',
      'QR code has expired (outside 180s freshness window).'
    );
  }

  if (computeFingerprintFromJwk(qrPayload.pk) !== qrPayload.fp) {
    throw new HttpsError(
      'permission-denied',
      'New public key does not match QR fingerprint.'
    );
  }

  if (!verifyQrSignature(qrPayload.pk, qrPayload)) {
    throw new HttpsError(
      'permission-denied',
      'Invalid signature against the new public key.'
    );
  }

  const db = getFirestore();
  const classSnap = await db.collection('classes').doc(classId).get();
  if (!classSnap.exists || classSnap.data()!.teacherUid !== request.auth.uid) {
    throw new HttpsError('permission-denied', 'You do not own this class.');
  }

  const verified = await downloadAndVerifySelfieFromStorage(
    qrPayload.sid,
    qrPayload.fp,
    qrPayload.sh
  );

  return { selfieDataUrl: verified.dataUrl };
});
