import { getStorage } from 'firebase-admin/storage';
import { HttpsError } from 'firebase-functions/v2/https';
import { sha256Hex } from './crypto';

export function buildSelfieStoragePath(sid: string, fp: string): string {
  return `selfies/${sid}/${fp}.webp`;
}

/** Per-teacher copy so Storage rules can authorize downloads by path alone. */
export function buildTeacherSelfiePath(
  teacherUid: string,
  sid: string,
  fp: string
): string {
  return `teacher-selfies/${teacherUid}/${sid}/${fp}.webp`;
}

export async function downloadAndVerifySelfieFromStorage(
  sid: string,
  fp: string,
  expectedSha256Hex: string
): Promise<{ path: string; dataUrl: string; bytes: Buffer }> {
  const path = buildSelfieStoragePath(sid, fp);
  const file = getStorage().bucket().file(path);
  const [exists] = await file.exists();
  if (!exists) {
    throw new HttpsError(
      'failed-precondition',
      'Student selfie has not finished uploading to Firebase Storage yet.'
    );
  }

  const [bytes] = await file.download();
  if (bytes.byteLength > 1048576) {
    throw new HttpsError('failed-precondition', 'Selfie exceeds 1 MB limit.');
  }

  const actualHash = sha256Hex(bytes);
  if (actualHash !== expectedSha256Hex) {
    throw new HttpsError(
      'permission-denied',
      'Stored selfie hash does not match signed QR hash.'
    );
  }

  return {
    path,
    dataUrl: `data:image/webp;base64,${bytes.toString('base64')}`,
    bytes,
  };
}

/**
 * Copies the verified selfie into the teacher's namespace and returns that path.
 * Storage rules grant reads on `teacher-selfies/{uid}/**` to the owning teacher,
 * which avoids cross-service Firestore lookups in Storage rules.
 */
export async function storeTeacherSelfieCopy(
  teacherUid: string,
  sid: string,
  fp: string,
  bytes: Buffer
): Promise<string> {
  const path = buildTeacherSelfiePath(teacherUid, sid, fp);
  const file = getStorage().bucket().file(path);
  await file.save(bytes, {
    contentType: 'image/webp',
    resumable: false,
    metadata: { cacheControl: 'private, max-age=31536000' },
  });
  return path;
}
