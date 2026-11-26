import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import {
  computeFingerprintFromJwk,
  ecPublicJwkSchema,
  isTimestampFresh,
  qrPayloadSchema,
  verifyQrSignature,
} from './crypto';
import {
  buildSelfieStoragePath,
  downloadAndVerifySelfieFromStorage,
} from './storageHelper';

const requestSchema = z.object({
  qrPayload: qrPayloadSchema,
  classId: z.string().min(1),
});

export const registerFirstScan = onCall(async (request) => {
  if (!request.auth || request.auth.token.teacher !== true) {
    throw new HttpsError(
      'permission-denied',
      'Only authenticated teachers can register scans.'
    );
  }

  const parsed = requestSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Malformed scan payload.');
  }

  const { qrPayload, classId } = parsed.data;
  const teacherUid = request.auth.uid;
  const db = getFirestore();

  if (!isTimestampFresh(qrPayload.ts)) {
    throw new HttpsError(
      'failed-precondition',
      'QR code has expired (outside 180s freshness window).'
    );
  }

  const classRef = db.collection('classes').doc(classId);
  const studentRef = db.collection('students').doc(qrPayload.sid);

  const txResult = await db.runTransaction(async (tx) => {
    const [classSnap, studentSnap] = await Promise.all([
      tx.get(classRef),
      tx.get(studentRef),
    ]);

    if (!classSnap.exists) {
      throw new HttpsError('not-found', 'Class not found.');
    }

    const classData = classSnap.data()!;
    if (classData.teacherUid !== teacherUid) {
      throw new HttpsError('permission-denied', 'You do not own this class.');
    }

    if (!studentSnap.exists) {
      throw new HttpsError(
        'not-found',
        'Student is not registered yet. Ask the student to complete registration while online first.'
      );
    }

    const student = studentSnap.data()!;

    if (qrPayload.n !== student.name) {
      throw new HttpsError(
        'permission-denied',
        'QR student name does not match registered student record.'
      );
    }

    if (qrPayload.fp !== student.keyFingerprint) {
      return {
        status: 'ROTATION_REQUIRED' as const,
        student,
      };
    }

    if (qrPayload.sh !== student.selfieHash) {
      throw new HttpsError(
        'permission-denied',
        'QR selfie hash does not match registered student record.'
      );
    }

    const expectedPath = buildSelfieStoragePath(qrPayload.sid, qrPayload.fp);
    if (student.selfiePath !== expectedPath) {
      throw new HttpsError(
        'permission-denied',
        'Student selfie storage path mismatch.'
      );
    }

    const storedJwk = ecPublicJwkSchema.parse(student.publicKeyJwk);
    if (computeFingerprintFromJwk(storedJwk) !== qrPayload.fp) {
      throw new HttpsError('permission-denied', 'Key fingerprint mismatch.');
    }

    if (!verifyQrSignature(storedJwk, qrPayload)) {
      throw new HttpsError('permission-denied', 'Invalid QR cryptographic signature.');
    }

    // Verify selfie exists in Storage and matches the signed SHA-256 hash
    // We download it here (admin SDK bypasses Storage rules) so the teacher
    // client can display it immediately without a second download race.
    const verified = await downloadAndVerifySelfieFromStorage(
      qrPayload.sid,
      qrPayload.fp,
      qrPayload.sh
    );

    tx.update(studentRef, {
      authorizedTeacherUids: FieldValue.arrayUnion(teacherUid),
    });
    tx.update(classRef, {
      studentIds: FieldValue.arrayUnion(qrPayload.sid),
    });

    const authorizedTeacherUids: string[] = Array.isArray(
      student.authorizedTeacherUids
    )
      ? Array.from(new Set([...student.authorizedTeacherUids, teacherUid]))
      : [teacherUid];

    return {
      status: 'REGISTERED' as const,
      selfieDataUrl: verified.dataUrl,
      student: {
        ...student,
        authorizedTeacherUids,
      },
    };
  });

  if (txResult.status === 'ROTATION_REQUIRED') {
    let rotationSelfieDataUrl: string | undefined;
    if (qrPayload.pk) {
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
      const verified = await downloadAndVerifySelfieFromStorage(
        qrPayload.sid,
        qrPayload.fp,
        qrPayload.sh
      );
      rotationSelfieDataUrl = verified.dataUrl;
    }

    return {
      ...txResult,
      rotationSelfieDataUrl,
    };
  }

  return txResult;
});
