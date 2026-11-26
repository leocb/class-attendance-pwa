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
import { studentNamesMatch } from './names';
import {
  buildTeacherSelfiePath,
  downloadAndVerifySelfieFromStorage,
  storeTeacherSelfieCopy,
} from './storageHelper';
import { studentDocId } from './studentKey';

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
  // Student identity is scoped to this teacher so school IDs may repeat across
  // teachers while staying unique within a roster.
  const studentRef = db
    .collection('students')
    .doc(studentDocId(teacherUid, qrPayload.sid));

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

    // Existing record for this teacher: verify the QR against the stored key.
    if (studentSnap.exists) {
      const student = studentSnap.data()!;

      if (!studentNamesMatch(qrPayload.n, student.name)) {
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

      const storedJwk = ecPublicJwkSchema.parse(student.publicKeyJwk);
      if (computeFingerprintFromJwk(storedJwk) !== qrPayload.fp) {
        throw new HttpsError('permission-denied', 'Key fingerprint mismatch.');
      }

      if (!verifyQrSignature(storedJwk, qrPayload)) {
        throw new HttpsError(
          'permission-denied',
          'Invalid QR cryptographic signature.'
        );
      }

      const verified = await downloadAndVerifySelfieFromStorage(
        qrPayload.sid,
        qrPayload.fp,
        qrPayload.sh
      );
      const expectedTeacherPath = buildTeacherSelfiePath(
        teacherUid,
        qrPayload.sid,
        qrPayload.fp
      );
      let selfiePath: string = student.selfiePath;
      if (selfiePath !== expectedTeacherPath) {
        selfiePath = await storeTeacherSelfieCopy(
          teacherUid,
          qrPayload.sid,
          qrPayload.fp,
          verified.bytes
        );
        tx.update(studentRef, { selfiePath });
      }

      tx.update(classRef, {
        studentIds: FieldValue.arrayUnion(qrPayload.sid),
      });

      return {
        status: 'REGISTERED' as const,
        selfieDataUrl: verified.dataUrl,
        student: { ...student, selfiePath },
      };
    }

    // First scan for this teacher: the QR is self-signed, so it supplies the
    // identity. The teacher's visual selfie check remains the authorization gate.
    if (!qrPayload.pk) {
      throw new HttpsError(
        'invalid-argument',
        'QR code is missing the student public key. Update the student app.'
      );
    }
    if (computeFingerprintFromJwk(qrPayload.pk) !== qrPayload.fp) {
      throw new HttpsError(
        'permission-denied',
        'Public key does not match QR fingerprint.'
      );
    }
    if (!verifyQrSignature(qrPayload.pk, qrPayload)) {
      throw new HttpsError(
        'permission-denied',
        'Invalid QR cryptographic signature.'
      );
    }

    const verified = await downloadAndVerifySelfieFromStorage(
      qrPayload.sid,
      qrPayload.fp,
      qrPayload.sh
    );
    const teacherSelfiePath = await storeTeacherSelfieCopy(
      teacherUid,
      qrPayload.sid,
      qrPayload.fp,
      verified.bytes
    );

    const student = {
      schoolStudentId: qrPayload.sid,
      name: qrPayload.n,
      teacherUid,
      publicKeyJwk: {
        kty: qrPayload.pk.kty,
        crv: qrPayload.pk.crv,
        x: qrPayload.pk.x,
        y: qrPayload.pk.y,
        ext: true,
        key_ops: ['verify'],
      },
      keyFingerprint: qrPayload.fp,
      selfiePath: teacherSelfiePath,
      selfieHash: qrPayload.sh,
      registrationTimestamp: Date.now(),
      rotatedKeys: [],
    };

    tx.set(studentRef, student);
    tx.update(classRef, {
      studentIds: FieldValue.arrayUnion(qrPayload.sid),
    });

    return {
      status: 'REGISTERED' as const,
      selfieDataUrl: verified.dataUrl,
      student,
    };
  });

  if (txResult.status === 'ROTATION_REQUIRED') {
    let rotationSelfieDataUrl: string | undefined;
    let storedSelfieDataUrl: string | undefined;

    // The scanning teacher is not authorized to read the old selfie yet, so the
    // Admin SDK fetches it for the side-by-side comparison in the rotation modal.
    try {
      const stored = await downloadAndVerifySelfieFromStorage(
        qrPayload.sid,
        txResult.student.keyFingerprint,
        txResult.student.selfieHash
      );
      storedSelfieDataUrl = stored.dataUrl;
    } catch {
      storedSelfieDataUrl = undefined;
    }

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
      storedSelfieDataUrl,
    };
  }

  return txResult;
});
