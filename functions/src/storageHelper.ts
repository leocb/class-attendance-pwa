import { getStorage } from 'firebase-admin/storage';
import { HttpsError } from 'firebase-functions/v2/https';
import { sha256Hex } from './crypto';

export function buildSelfieStoragePath(sid: string, fp: string): string {
  return `selfies/${sid}/${fp}.webp`;
}

export async function downloadAndVerifySelfieFromStorage(
  sid: string,
  fp: string,
  expectedSha256Hex: string
): Promise<{ path: string; dataUrl: string }> {
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
  };
}
