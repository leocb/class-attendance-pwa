import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';

const requestSchema = z.object({
  sid: z.string().trim().min(1).max(64),
  fp: z.string().length(8),
});

/**
 * Tells a student device whether its current key has been accepted by at least
 * one teacher (any teacher record with this sid + fingerprint). The QR screen
 * uses it to clear the "New Key QR Active" banner after a rotation approval.
 */
export const getKeyStatus = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in to check key status.');
  }

  const parsed = requestSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Malformed key status request.');
  }
  const { sid, fp } = parsed.data;

  const snap = await getFirestore()
    .collection('students')
    .where('keyFingerprint', '==', fp)
    .limit(20)
    .get();

  const registered = snap.docs.some(
    (doc) => doc.data().schoolStudentId === sid
  );

  return { registered };
});
