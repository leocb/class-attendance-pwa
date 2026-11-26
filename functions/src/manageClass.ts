import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';

const requestSchema = z.object({
  classId: z.string().min(1).max(128),
  action: z.enum(['rename', 'archive', 'unarchive']),
  name: z.string().trim().min(1).max(120).nullable().optional(),
});

/**
 * Teacher-owned class management. Client writes to `classes` are forbidden by
 * Firestore rules, so rename/archive flows through this Admin SDK callable.
 */
export const manageClass = onCall(async (request) => {
  if (!request.auth || request.auth.token.teacher !== true) {
    throw new HttpsError(
      'permission-denied',
      'Only authenticated teachers can manage classes.'
    );
  }

  const parsed = requestSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Malformed class update.');
  }

  const { classId, action, name } = parsed.data;
  const db = getFirestore();
  const ref = db.collection('classes').doc(classId);
  const snap = await ref.get();

  if (!snap.exists) {
    throw new HttpsError('not-found', 'Class not found.');
  }
  if (snap.data()?.teacherUid !== request.auth.uid) {
    throw new HttpsError('permission-denied', 'You do not own this class.');
  }

  if (action === 'rename') {
    if (!name) {
      throw new HttpsError('invalid-argument', 'A class name is required.');
    }
    await ref.update({ name });
    return { classId, action, name };
  }

  const archived = action === 'archive';
  await ref.update({ archived, archivedAt: archived ? Date.now() : null });
  return { classId, action, archived };
});
