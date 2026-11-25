import { getBytes, ref, uploadBytes } from 'firebase/storage';
import { storage } from './client';
import { CONFIG } from '../config';
import { sha256Hex } from '../crypto';
import { bytesToWebpDataUrl } from '../image/selfie';
import {
  getCachedSelfie,
  putCachedSelfie,
  selfieCacheKey,
} from '../idb';
import type { Student } from '../../types';

export function buildSelfieStoragePath(sid: string, fp: string): string {
  return `selfies/${sid}/${fp}.webp`;
}

export async function uploadStudentSelfie(params: {
  sid: string;
  fp: string;
  deviceUid: string;
  bytes: Uint8Array;
}): Promise<string> {
  const path = buildSelfieStoragePath(params.sid, params.fp);
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, params.bytes, {
    contentType: 'image/webp',
    customMetadata: {
      deviceUid: params.deviceUid,
      fingerprint: params.fp,
    },
  });
  return path;
}

/**
 * Returns a locally cached selfie dataUrl for the student, or downloads it from
 * Firebase Storage (verifying SHA-256 against student.selfieHash) and caches it in IDB.
 */
export async function ensureStudentSelfieCached(
  student: Student
): Promise<string | null> {
  const existing = await getCachedSelfie(
    student.schoolStudentId,
    student.keyFingerprint
  );
  if (existing && existing.selfieHash === student.selfieHash) {
    return existing.dataUrl;
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return existing?.dataUrl ?? null;
  }

  try {
    const path =
      student.selfiePath ||
      buildSelfieStoragePath(student.schoolStudentId, student.keyFingerprint);
    const buffer = await getBytes(ref(storage, path), CONFIG.SELFIE_MAX_BYTES);
    const bytes = new Uint8Array(buffer);
    const actualHash = await sha256Hex(bytes);
    if (actualHash !== student.selfieHash) {
      throw new Error('Downloaded selfie hash mismatch.');
    }
    const dataUrl = bytesToWebpDataUrl(bytes);
    await putCachedSelfie({
      cacheKey: selfieCacheKey(student.schoolStudentId, student.keyFingerprint),
      schoolStudentId: student.schoolStudentId,
      keyFingerprint: student.keyFingerprint,
      selfieHash: student.selfieHash,
      dataUrl,
      updatedAt: Date.now(),
    });
    return dataUrl;
  } catch {
    return existing?.dataUrl ?? null;
  }
}
