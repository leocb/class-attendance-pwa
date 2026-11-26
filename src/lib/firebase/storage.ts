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

function legacyThumbMimeType(base64: string): string {
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  if (base64.startsWith('iVBOR')) return 'image/png';
  return 'image/webp';
}

/**
 * Legacy (v2) records have no Storage object: the signed selfie lives inline in
 * the student document as `selfieThumb`, and `selfieHash` is the SHA-256 of that
 * base64 string (not of the decoded bytes). Only return it when that legacy hash
 * matches the signed value, so we never render an image the QR did not sign.
 */
async function verifiedLegacySelfie(student: Student): Promise<string | null> {
  const base64 = student.selfieThumb;
  if (!base64 || base64.length === 0) return null;

  try {
    const legacyHash = await sha256Hex(new TextEncoder().encode(base64));
    if (legacyHash !== student.selfieHash) {
      console.warn(
        '[selfie] legacy selfieThumb does not match the signed hash; skipping render'
      );
      return null;
    }
    return `data:${legacyThumbMimeType(base64)};base64,${base64}`;
  } catch (err) {
    console.warn('[selfie] failed to read legacy selfieThumb', err);
    return null;
  }
}

async function cacheSelfie(student: Student, dataUrl: string): Promise<string> {
  await putCachedSelfie({
    cacheKey: selfieCacheKey(student.schoolStudentId, student.keyFingerprint),
    schoolStudentId: student.schoolStudentId,
    keyFingerprint: student.keyFingerprint,
    selfieHash: student.selfieHash,
    dataUrl,
    updatedAt: Date.now(),
  });
  return dataUrl;
}

/**
 * Returns a locally cached selfie dataUrl for the student, or downloads it from
 * Firebase Storage (verifying SHA-256 against student.selfieHash) and caches it in IDB.
 * Falls back to the hash-verified legacy inline thumbnail for pre-Storage records.
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

  const offline =
    typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
      ? !navigator.onLine
      : false;

  const selfiePath = student.selfiePath;

  // Offline, or a legacy record with no Storage object: use the inline copy.
  if (offline || !selfiePath) {
    const legacy = await verifiedLegacySelfie(student);
    if (legacy) return cacheSelfie(student, legacy);
    return existing?.dataUrl ?? null;
  }

  try {
    const buffer = await getBytes(
      ref(storage, selfiePath),
      CONFIG.SELFIE_MAX_BYTES
    );
    const bytes = new Uint8Array(buffer);
    const actualHash = await sha256Hex(bytes);
    if (actualHash !== student.selfieHash) {
      throw new Error('Downloaded selfie hash mismatch.');
    }
    return await cacheSelfie(student, bytesToWebpDataUrl(bytes));
  } catch (err) {
    console.warn(
      `[selfie] could not download ${selfiePath} for ${student.schoolStudentId}`,
      err
    );
    const legacy = await verifiedLegacySelfie(student);
    if (legacy) return cacheSelfie(student, legacy);
    return existing?.dataUrl ?? null;
  }
}
