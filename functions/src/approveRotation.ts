import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import {
  computeFingerprintFromJwk,
  isTimestampFresh,
  qrPayloadSchema,
  verifyQrSignature,
} from './crypto';
import {
  downloadAndVerifySelfieFromStorage,
  storeTeacherSelfieCopy,
} from './storageHelper';
import { studentDocId } from './studentKey';

const requestSchema = z.object({
  qrPayload: qrPayloadSchema,
  classId: z.string().min(1),
});

export const approveRotation = onCall(async (request) => {
  if (!request.auth || request.auth.token.teacher !== true) {
    throw new HttpsError(
      'permission-denied',
      'Only authenticated teachers can approve key rotations.'
    );
  }

  const parsed = requestSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Malformed rotation payload.');
  }

  const { qrPayload, classId } = parsed.data;
  const teacherUid = request.auth.uid;

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

  const derivedFp = computeFingerprintFromJwk(qrPayload.pk);
  if (derivedFp !== qrPayload.fp) {
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

  const verifiedSelfie = await downloadAndVerifySelfieFromStorage(
    qrPayload.sid,
    qrPayload.fp,
    qrPayload.sh
  );
  const teacherSelfiePath = await storeTeacherSelfieCopy(
    teacherUid,
    qrPayload.sid,
    qrPayload.fp,
    verifiedSelfie.bytes
  );

  const db = getFirestore();
  const classRef = db.collection('classes').doc(classId);
  const studentRef = db
    .collection('students')
    .doc(studentDocId(teacherUid, qrPayload.sid));

  const updatedStudent = await db.runTransaction(async (tx) => {
    const [classSnap, studentSnap] = await Promise.all([
      tx.get(classRef),
      tx.get(studentRef),
    ]);

    if (!classSnap.exists) {
      throw new HttpsError('not-found', 'Class not found.');
    }

    if (classSnap.data()!.teacherUid !== teacherUid) {
      throw new HttpsError('permission-denied', 'You do not own this class.');
    }

    if (!studentSnap.exists) {
      throw new HttpsError('not-found', 'Student record not found.');
    }

    const existing = studentSnap.data()!;

    if (
      existing.lastRotationNonce === qrPayload.nce ||
      (typeof existing.lastRotationTs === 'number' &&
        qrPayload.ts < existing.lastRotationTs)
    ) {
      throw new HttpsError(
        'failed-precondition',
        'Stale or replayed rotation QR.'
      );
    }

    const oldEntry = {
      fingerprint: existing.keyFingerprint,
      publicKeyJwk: existing.publicKeyJwk,
      replacedAt: Date.now(),
    };

    const nextRotatedKeys = [
      ...(Array.isArray(existing.rotatedKeys) ? existing.rotatedKeys : []),
      oldEntry,
    ];

    const cleanNewJwk = {
      kty: qrPayload.pk!.kty,
      crv: qrPayload.pk!.crv,
      x: qrPayload.pk!.x,
      y: qrPayload.pk!.y,
      ext: true,
      key_ops: ['verify'],
    };

    const nextName = qrPayload.n.trim();

    tx.update(studentRef, {
      name: nextName,
      publicKeyJwk: cleanNewJwk,
      keyFingerprint: qrPayload.fp,
      selfiePath: teacherSelfiePath,
      selfieHash: qrPayload.sh,
      rotatedKeys: nextRotatedKeys,
      lastRotationNonce: qrPayload.nce,
      lastRotationTs: qrPayload.ts,
    });

    tx.update(classRef, {
      studentIds: FieldValue.arrayUnion(qrPayload.sid),
    });

    return {
      ...existing,
      name: nextName,
      publicKeyJwk: cleanNewJwk,
      keyFingerprint: qrPayload.fp,
      selfiePath: teacherSelfiePath,
      selfieHash: qrPayload.sh,
      rotatedKeys: nextRotatedKeys,
    };
  });

  return {
    status: 'ROTATED' as const,
    student: updatedStudent,
    selfieDataUrl: verifiedSelfie.dataUrl,
  };
});
