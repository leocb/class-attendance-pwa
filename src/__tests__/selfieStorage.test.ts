import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256Hex } from '../lib/crypto';
import type { Student } from '../types';

const getBytesMock = vi.fn();
const idbStore = new Map<string, unknown>();

vi.mock('firebase/storage', () => ({
  ref: (_storage: unknown, path: string) => ({ path }),
  getBytes: (...args: unknown[]) => getBytesMock(...args),
  uploadBytes: vi.fn(),
}));

vi.mock('../lib/firebase/client', () => ({
  storage: {},
}));

vi.mock('../lib/idb', () => ({
  selfieCacheKey: (sid: string, fp: string) => `${sid}__${fp}`,
  getCachedSelfie: async (sid: string, fp: string) =>
    idbStore.get(`${sid}__${fp}`),
  putCachedSelfie: async (record: { cacheKey: string }) => {
    idbStore.set(record.cacheKey, record);
  },
}));

import { ensureStudentSelfieCached } from '../lib/firebase/storage';

const WEBP_BYTES = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4, 87, 69, 66, 80]);
const WEBP_BASE64 = btoa(String.fromCharCode(...WEBP_BYTES));

function baseStudent(overrides: Partial<Student>): Student {
  return {
    schoolStudentId: 'S1001',
    name: 'Alice Rivera',
    deviceUid: 'anon-uid-1',
    publicKeyJwk: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y' },
    keyFingerprint: 'ABCD2345',
    selfieHash: '',
    registrationTimestamp: 1700000000000,
    authorizedTeacherUids: [],
    rotatedKeys: [],
    ...overrides,
  };
}

describe('ensureStudentSelfieCached', () => {
  beforeEach(() => {
    getBytesMock.mockReset();
    idbStore.clear();
  });

  it('downloads, hash-verifies, and caches a Storage selfie', async () => {
    const selfieHash = await sha256Hex(WEBP_BYTES);
    getBytesMock.mockResolvedValue(WEBP_BYTES.buffer);

    const url = await ensureStudentSelfieCached(
      baseStudent({
        selfiePath: 'selfies/S1001/ABCD2345.webp',
        selfieHash,
      })
    );

    expect(getBytesMock).toHaveBeenCalledOnce();
    expect(url).toBe(`data:image/webp;base64,${WEBP_BASE64}`);
    expect(idbStore.size).toBe(1);
  });

  it('falls back to a hash-verified legacy selfieThumb when Storage has no object', async () => {
    // Legacy records signed SHA-256 of the base64 string, not of the bytes.
    const legacyHash = await sha256Hex(new TextEncoder().encode(WEBP_BASE64));

    const url = await ensureStudentSelfieCached(
      baseStudent({ selfieThumb: WEBP_BASE64, selfieHash: legacyHash })
    );

    expect(getBytesMock).not.toHaveBeenCalled();
    expect(url).toBe(`data:image/webp;base64,${WEBP_BASE64}`);
  });

  it('refuses a legacy selfieThumb whose hash does not match the signed value', async () => {
    const url = await ensureStudentSelfieCached(
      baseStudent({ selfieThumb: WEBP_BASE64, selfieHash: 'deadbeef' })
    );

    expect(url).toBeNull();
    expect(idbStore.size).toBe(0);
  });

  it('uses the verified legacy thumb when the Storage download fails', async () => {
    const legacyHash = await sha256Hex(new TextEncoder().encode(WEBP_BASE64));
    getBytesMock.mockRejectedValue(new Error('storage/unauthorized'));

    const url = await ensureStudentSelfieCached(
      baseStudent({
        selfiePath: 'selfies/S1001/ABCD2345.webp',
        selfieThumb: WEBP_BASE64,
        selfieHash: legacyHash,
      })
    );

    expect(url).toBe(`data:image/webp;base64,${WEBP_BASE64}`);
  });
});
