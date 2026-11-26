import { describe, expect, it, vi } from 'vitest';
import {
  buildCanonicalSignString,
  computeFingerprintFromJwk,
  exportPublicKeyJwk,
  generateNonce,
  generateStudentKeyPair,
  sha256Hex,
  signCanonicalString,
} from '../lib/crypto';
import {
  confirmKeyRotationAndRecord,
  processScannedQr,
  type ScanPipelineDeps,
} from '../features/teacher/scan/scanPipeline';
import type { Attendance, QrPayload, Student } from '../types';

async function createStudentFixture(sid = 'S1001', name = 'Alice Rivera') {
  const keyPair = await generateStudentKeyPair();
  const publicKeyJwk = await exportPublicKeyJwk(keyPair.publicKey);
  const keyFingerprint = await computeFingerprintFromJwk(publicKeyJwk);
  const selfieHash = await sha256Hex(new Uint8Array([10, 20, 30, 40]));

  const student: Student = {
    schoolStudentId: sid,
    name,
    deviceUid: 'anon-uid-1',
    publicKeyJwk,
    keyFingerprint,
    selfiePath: `selfies/${sid}/${keyFingerprint}.webp`,
    selfieHash,
    registrationTimestamp: 1700000000000,
    rotatedKeys: [],
  };

  return { keyPair, student };
}

async function signQr(
  student: Student,
  privateKey: CryptoKey,
  ts: number,
  options?: { sh?: string; includePk?: boolean; name?: string }
): Promise<{ payload: QrPayload; raw: string }> {
  const nce = generateNonce();
  const sh = options?.sh ?? student.selfieHash;
  const n = options?.name ?? student.name;
  const canonical = buildCanonicalSignString({
    sid: student.schoolStudentId,
    n,
    ts,
    nce,
    fp: student.keyFingerprint,
    imgHash: sh,
  });
  const sig = await signCanonicalString(privateKey, canonical);
  const payload: QrPayload = {
    v: 1,
    sid: student.schoolStudentId,
    n,
    ts,
    nce,
    fp: student.keyFingerprint,
    sh,
    sig,
    ...(options?.includePk ? { pk: student.publicKeyJwk } : {}),
  };
  return { payload, raw: JSON.stringify(payload) };
}

function makeMemoryDeps(overrides?: Partial<ScanPipelineDeps>) {
  const studentCache = new Map<string, Student>();
  const selfieCache = new Map<string, string>();
  const attendanceRecords: Attendance[] = [];

  const deps: ScanPipelineDeps = {
    isOnline: () => true,
    getCachedStudent: async (sid) => studentCache.get(sid),
    putCachedStudent: async (st) => {
      studentCache.set(st.schoolStudentId, st);
    },
    ensureStudentSelfieCached: async (st) => {
      const key = `${st.schoolStudentId}__${st.keyFingerprint}`;
      if (!selfieCache.has(key)) {
        selfieCache.set(key, `data:image/webp;base64,cached_${st.keyFingerprint}`);
      }
      return selfieCache.get(key)!;
    },
    cacheSelfieDataUrl: async (sid, fp, _hash, dataUrl) => {
      selfieCache.set(`${sid}__${fp}`, dataUrl);
    },
    registerFirstScan: vi.fn(async (qr) => {
      const st = studentCache.get(`server:${qr.sid}`);
      if (!st) throw new Error('Not found');
      const updated = { ...st };
      return { status: 'REGISTERED' as const, student: updated };
    }),
    getRotationSelfie: vi.fn(async () => ({
      selfieDataUrl: 'data:image/webp;base64,new_selfie',
    })),
    approveRotation: vi.fn(async (qr) => {
      const existing = studentCache.get(qr.sid)!;
      const updated: Student = {
        ...existing,
        publicKeyJwk: qr.pk!,
        keyFingerprint: qr.fp,
        selfiePath: `selfies/${qr.sid}/${qr.fp}.webp`,
        selfieHash: qr.sh,
        rotatedKeys: [
          ...existing.rotatedKeys,
          {
            fingerprint: existing.keyFingerprint,
            publicKeyJwk: existing.publicKeyJwk,
            replacedAt: Date.now(),
          },
        ],
      };
      return {
        status: 'ROTATED' as const,
        student: updated,
        selfieDataUrl: 'data:image/webp;base64,new_selfie',
      };
    }),
    hasAttendanceForToday: async (classId, sessionDate, sid) =>
      attendanceRecords.some(
        (r) =>
          r.classId === classId &&
          r.sessionDate === sessionDate &&
          r.schoolStudentId === sid
      ),
    saveAttendance: async (record) => {
      attendanceRecords.push(record);
    },
    getEstimatedNowSec: async () => 1712345678,
    getSessionDate: () => '2026-11-25',
    ...overrides,
  };

  return { deps, studentCache, selfieCache, attendanceRecords };
}

describe('Teacher Scan Pipeline (Storage + Local Cache)', () => {
  it('rejects first scan when offline and caches student + selfie when online', async () => {
    const { keyPair, student } = await createStudentFixture();
    const { raw } = await signQr(student, keyPair.privateKey, 1712345678);

    const offline = makeMemoryDeps({ isOnline: () => false });
    const resOffline = await processScannedQr(
      raw,
      { classId: 'c1', teacherUid: 'teacher-1' },
      offline.deps
    );
    expect(resOffline.status).toBe('REJECTED');
    if (resOffline.status === 'REJECTED') {
      expect(resOffline.code).toBe('FIRST_SCAN_OFFLINE');
    }

    const online = makeMemoryDeps({
      registerFirstScan: vi.fn(async () => ({
        status: 'REGISTERED' as const,
        student: { ...student },
      })),
    });
    const resOnline = await processScannedQr(
      raw,
      { classId: 'c1', teacherUid: 'teacher-1' },
      online.deps
    );
    expect(resOnline.status).toBe('RECORDED');
    if (resOnline.status === 'RECORDED') {
      expect(resOnline.selfieDataUrl).toContain('data:image/webp;base64,');
    }
    expect(online.attendanceRecords).toHaveLength(1);
    expect(await online.deps.getCachedStudent('S1001')).toBeDefined();
  });

  it('uses the server-verified selfie returned by the first-scan callable', async () => {
    const { keyPair, student } = await createStudentFixture();
    const { raw } = await signQr(student, keyPair.privateKey, 1712345678);

    const ensureSelfie = vi.fn(
      async () => 'data:image/webp;base64,from_storage'
    );
    const cacheSelfie = vi.fn(async () => {});
    const serverSelfie = 'data:image/webp;base64,from_server';

    const { deps } = makeMemoryDeps({
      registerFirstScan: vi.fn(async () => ({
        status: 'REGISTERED' as const,
        student: { ...student },
        selfieDataUrl: serverSelfie,
      })),
      ensureStudentSelfieCached: ensureSelfie,
      cacheSelfieDataUrl: cacheSelfie,
    });

    const res = await processScannedQr(
      raw,
      { classId: 'c1', teacherUid: 'teacher-1' },
      deps
    );

    expect(res.status).toBe('RECORDED');
    if (res.status === 'RECORDED') {
      expect(res.selfieDataUrl).toBe(serverSelfie);
    }
    expect(ensureSelfie).not.toHaveBeenCalled();
    expect(cacheSelfie).toHaveBeenCalledWith(
      student.schoolStudentId,
      student.keyFingerprint,
      student.selfieHash,
      serverSelfie
    );
  });

  it('accepts case differences in the student name on re-scan', async () => {
    const { keyPair, student } = await createStudentFixture('S2002', 'Leo Teste');
    const { raw } = await signQr(student, keyPair.privateKey, 1712345678, {
      name: 'leo teste',
    });

    const { deps, studentCache, attendanceRecords } = makeMemoryDeps();
    studentCache.set(student.schoolStudentId, student);

    const res = await processScannedQr(
      raw,
      { classId: 'c1', teacherUid: 'teacher-1' },
      deps
    );

    expect(res.status).toBe('RECORDED');
    expect(attendanceRecords).toHaveLength(1);
  });

  it('verifies subsequent scans fully offline and ignores duplicate same-day scans', async () => {
    const { keyPair, student } = await createStudentFixture();
    const { raw } = await signQr(student, keyPair.privateKey, 1712345678);

    const { deps, studentCache, attendanceRecords } = makeMemoryDeps({
      isOnline: () => false,
    });
    studentCache.set(student.schoolStudentId, student);

    const first = await processScannedQr(
      raw,
      { classId: 'c1', teacherUid: 'teacher-1' },
      deps
    );
    expect(first.status).toBe('RECORDED');
    expect(attendanceRecords).toHaveLength(1);

    const second = await processScannedQr(
      raw,
      { classId: 'c1', teacherUid: 'teacher-1' },
      deps
    );
    expect(second.status).toBe('DUPLICATE_IGNORED');
    expect(attendanceRecords).toHaveLength(1);
  });

  it('rejects expired QR (>180s) and tampered signatures offline', async () => {
    const { keyPair, student } = await createStudentFixture();
    const { deps, studentCache } = makeMemoryDeps({ isOnline: () => false });
    studentCache.set(student.schoolStudentId, student);

    const stale = await signQr(student, keyPair.privateKey, 1712345678 - 200);
    const staleRes = await processScannedQr(
      stale.raw,
      { classId: 'c1', teacherUid: 'teacher-1' },
      deps
    );
    expect(staleRes.status).toBe('REJECTED');
    if (staleRes.status === 'REJECTED') {
      expect(staleRes.code).toBe('EXPIRED_QR');
    }

    const fresh = await signQr(student, keyPair.privateKey, 1712345678);
    const tampered = JSON.stringify({ ...fresh.payload, n: 'Bob Impostor' });
    const tamperedRes = await processScannedQr(
      tampered,
      { classId: 'c1', teacherUid: 'teacher-1' },
      deps
    );
    expect(tamperedRes.status).toBe('REJECTED');
    if (tamperedRes.status === 'REJECTED') {
      expect(tamperedRes.code).toBe('INVALID_SIGNATURE');
    }
  });

  it('handles key rotation: rejects offline, fetches new selfie online, updates key on approve', async () => {
    const oldFixture = await createStudentFixture('S1001', 'Alice Rivera');
    const newFixture = await createStudentFixture('S1001', 'Alice Rivera');
    const newQr = await signQr(
      newFixture.student,
      newFixture.keyPair.privateKey,
      1712345678,
      { includePk: true }
    );

    const offline = makeMemoryDeps({ isOnline: () => false });
    offline.studentCache.set('S1001', oldFixture.student);
    const resOffline = await processScannedQr(
      newQr.raw,
      { classId: 'c1', teacherUid: 'teacher-1' },
      offline.deps
    );
    expect(resOffline.status).toBe('REJECTED');
    if (resOffline.status === 'REJECTED') {
      expect(resOffline.code).toBe('ROTATION_OFFLINE');
    }

    const online = makeMemoryDeps({ isOnline: () => true });
    online.studentCache.set('S1001', oldFixture.student);
    const resPrompt = await processScannedQr(
      newQr.raw,
      { classId: 'c1', teacherUid: 'teacher-1' },
      online.deps
    );
    expect(resPrompt.status).toBe('ROTATION_NEEDED');
    if (resPrompt.status === 'ROTATION_NEEDED') {
      expect(resPrompt.newSelfieDataUrl).toBe('data:image/webp;base64,new_selfie');
    }

    const resApproved = await confirmKeyRotationAndRecord(
      newQr.payload,
      { classId: 'c1', teacherUid: 'teacher-1' },
      online.deps
    );
    expect(resApproved.status).toBe('RECORDED');
    expect(online.attendanceRecords).toHaveLength(1);
    const cachedAfter = await online.deps.getCachedStudent('S1001');
    expect(cachedAfter?.keyFingerprint).toBe(newFixture.student.keyFingerprint);
    expect(cachedAfter?.rotatedKeys).toHaveLength(1);
  });

  it('rejects name/selfie-hash tampering and cross-class nonce replay', async () => {
    const { keyPair, student } = await createStudentFixture('S1002', 'Carla Dias');
    const seenNonces = new Set<string>();
    const { deps, studentCache } = makeMemoryDeps({
      isOnline: () => false,
      hasAndMarkNonce: (sid, nce) => {
        const key = `${sid}__${nce}`;
        if (seenNonces.has(key)) return true;
        seenNonces.add(key);
        return false;
      },
    });
    studentCache.set(student.schoolStudentId, student);

    // Student alters local name while signing with their own key
    const forgedNameQr = await signQr(
      { ...student, name: 'Fake Student' },
      keyPair.privateKey,
      1712345678
    );
    const nameRes = await processScannedQr(
      forgedNameQr.raw,
      { classId: 'c1', teacherUid: 'teacher-1' },
      deps
    );
    expect(nameRes.status).toBe('REJECTED');
    if (nameRes.status === 'REJECTED') {
      expect(nameRes.code).toBe('NAME_MISMATCH');
    }

    // Student alters local selfieHash while signing with their own key
    const forgedHashQr = await signQr(
      student,
      keyPair.privateKey,
      1712345678,
      { sh: '0'.repeat(64) }
    );
    const hashRes = await processScannedQr(
      forgedHashQr.raw,
      { classId: 'c1', teacherUid: 'teacher-1' },
      deps
    );
    expect(hashRes.status).toBe('REJECTED');
    if (hashRes.status === 'REJECTED') {
      expect(hashRes.code).toBe('SELFIE_HASH_MISMATCH');
    }

    // Valid QR scanned in Class 1 succeeds, replaying exact nonce in Class 2 is rejected
    const validQr = await signQr(student, keyPair.privateKey, 1712345678);
    const c1Res = await processScannedQr(
      validQr.raw,
      { classId: 'c1', teacherUid: 'teacher-1' },
      deps
    );
    expect(c1Res.status).toBe('RECORDED');

    const c2ReplayRes = await processScannedQr(
      validQr.raw,
      { classId: 'c2', teacherUid: 'teacher-1' },
      deps
    );
    expect(c2ReplayRes.status).toBe('REJECTED');
    if (c2ReplayRes.status === 'REJECTED') {
      expect(c2ReplayRes.code).toBe('REPLAYED_NONCE');
    }
  });
});
