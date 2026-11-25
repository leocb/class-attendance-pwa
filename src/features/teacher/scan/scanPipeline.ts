import {
  buildCanonicalSignString,
  verifyCanonicalSignature,
} from '../../../lib/crypto';
import {
  getEstimatedServerNowSec,
  getLocalSessionDate,
  isTimestampFresh,
} from '../../../lib/time';
import { parseQrPayload } from '../../../lib/validation/qrSchema';
import type { Attendance, QrPayload, Student } from '../../../types';

export type ScanErrorCode =
  | 'MALFORMED_QR'
  | 'FIRST_SCAN_OFFLINE'
  | 'FIRST_SCAN_FAILED'
  | 'ROTATION_OFFLINE'
  | 'INVALID_SIGNATURE'
  | 'EXPIRED_QR'
  | 'NAME_MISMATCH'
  | 'SELFIE_HASH_MISMATCH'
  | 'REPLAYED_NONCE'
  | 'ROTATION_FAILED'
  | 'SELFIE_FETCH_FAILED';

export interface ScanPipelineDeps {
  isOnline: () => boolean;
  getCachedStudent: (sid: string) => Promise<Student | undefined>;
  putCachedStudent: (student: Student) => Promise<void>;
  ensureStudentSelfieCached: (student: Student) => Promise<string | null>;
  cacheSelfieDataUrl: (
    sid: string,
    fp: string,
    hash: string,
    dataUrl: string
  ) => Promise<void>;
  registerFirstScan: (
    qr: QrPayload,
    classId: string
  ) => Promise<{
    status: 'REGISTERED' | 'ROTATION_REQUIRED';
    student: Student;
    rotationSelfieDataUrl?: string;
  }>;
  getRotationSelfie: (
    qr: QrPayload,
    classId: string
  ) => Promise<{ selfieDataUrl: string }>;
  approveRotation: (
    qr: QrPayload,
    classId: string
  ) => Promise<{
    status: 'ROTATED';
    student: Student;
    selfieDataUrl: string;
  }>;
  hasAttendanceForToday: (
    classId: string,
    sessionDate: string,
    sid: string
  ) => Promise<boolean>;
  saveAttendance: (record: Attendance, docId: string) => Promise<void>;
  getEstimatedNowSec?: () => Promise<number>;
  getSessionDate?: () => string;
  classStudentIds?: string[];
  hasAndMarkNonce?: (sid: string, nce: string) => boolean;
}

export type ScanOutcome =
  | {
      status: 'RECORDED';
      student: Student;
      attendance: Attendance;
      qr: QrPayload;
      selfieDataUrl: string | null;
      selfieWarning: boolean;
      firstScan: boolean;
    }
  | {
      status: 'DUPLICATE_IGNORED';
      student: Student;
      qr: QrPayload;
      selfieDataUrl: string | null;
      selfieWarning: boolean;
    }
  | {
      status: 'ROTATION_NEEDED';
      qr: QrPayload;
      storedStudent: Student;
      storedSelfieDataUrl: string | null;
      newSelfieDataUrl: string | null;
    }
  | {
      status: 'REJECTED';
      code: ScanErrorCode;
      detail?: string;
    };

export async function processScannedQr(
  rawQr: string,
  params: { classId: string; teacherUid: string },
  deps: ScanPipelineDeps
): Promise<ScanOutcome> {
  // 1. Schema check with zod
  const qr = parseQrPayload(rawQr);
  if (!qr) {
    return { status: 'REJECTED', code: 'MALFORMED_QR' };
  }

  // 2. Look up student in local cache by sid
  let student = await deps.getCachedStudent(qr.sid);
  let firstScan = false;

  if (!student) {
    if (!deps.isOnline()) {
      return { status: 'REJECTED', code: 'FIRST_SCAN_OFFLINE' };
    }

    try {
      const res = await deps.registerFirstScan(qr, params.classId);
      if (res.status === 'ROTATION_REQUIRED') {
        const storedSelfieDataUrl = await deps.ensureStudentSelfieCached(res.student);
        let newSelfieDataUrl = res.rotationSelfieDataUrl ?? null;
        if (!newSelfieDataUrl && qr.pk) {
          const fetched = await deps.getRotationSelfie(qr, params.classId);
          newSelfieDataUrl = fetched.selfieDataUrl;
        }
        return {
          status: 'ROTATION_NEEDED',
          qr,
          storedStudent: res.student,
          storedSelfieDataUrl,
          newSelfieDataUrl,
        };
      }
      student = res.student;
      firstScan = true;
      await deps.putCachedStudent(student);
    } catch (err) {
      return {
        status: 'REJECTED',
        code: 'FIRST_SCAN_FAILED',
        detail: err instanceof Error ? err.message : undefined,
      };
    }
  } else if (qr.fp !== student.keyFingerprint) {
    // 3. Key fingerprint changed -> rotation path
    if (!deps.isOnline()) {
      return { status: 'REJECTED', code: 'ROTATION_OFFLINE' };
    }
    try {
      const [storedSelfieDataUrl, fetched] = await Promise.all([
        deps.ensureStudentSelfieCached(student),
        deps.getRotationSelfie(qr, params.classId),
      ]);
      return {
        status: 'ROTATION_NEEDED',
        qr,
        storedStudent: student,
        storedSelfieDataUrl,
        newSelfieDataUrl: fetched.selfieDataUrl,
      };
    } catch (err) {
      return {
        status: 'REJECTED',
        code: 'SELFIE_FETCH_FAILED',
        detail: err instanceof Error ? err.message : undefined,
      };
    }
  }

  // 4. Local ECDSA signature verify
  if (!firstScan) {
    const canonical = buildCanonicalSignString({
      sid: qr.sid,
      n: qr.n,
      ts: qr.ts,
      nce: qr.nce,
      fp: qr.fp,
      imgHash: qr.sh,
    });
    const sigOk = await verifyCanonicalSignature(
      student.publicKeyJwk,
      canonical,
      qr.sig
    );
    if (!sigOk) {
      return { status: 'REJECTED', code: 'INVALID_SIGNATURE' };
    }

    // 5. Timestamp freshness: |teacherEstimatedNow - qr.ts| <= 180s
    const nowSec = deps.getEstimatedNowSec
      ? await deps.getEstimatedNowSec()
      : await getEstimatedServerNowSec();
    if (!isTimestampFresh(qr.ts, nowSec)) {
      return { status: 'REJECTED', code: 'EXPIRED_QR' };
    }

    // Check name & selfie hash consistency against stored student record
    if (qr.n !== student.name) {
      return { status: 'REJECTED', code: 'NAME_MISMATCH' };
    }
    if (qr.sh !== student.selfieHash) {
      return { status: 'REJECTED', code: 'SELFIE_HASH_MISMATCH' };
    }

    // Prevent identical QR nonce replay across classes within the active window
    if (deps.hasAndMarkNonce && deps.hasAndMarkNonce(qr.sid, qr.nce)) {
      return { status: 'REJECTED', code: 'REPLAYED_NONCE' };
    }

    // Sync membership to this class when online if needed
    if (
      deps.isOnline() &&
      deps.classStudentIds &&
      !deps.classStudentIds.includes(qr.sid)
    ) {
      void deps.registerFirstScan(qr, params.classId).catch(() => {});
    }
  } else if (deps.hasAndMarkNonce) {
    deps.hasAndMarkNonce(qr.sid, qr.nce);
  }

  // 6. Selfie hash consistency verified above
  const selfieWarning = qr.sh !== student.selfieHash;

  // 7. Ensure selfie is cached locally in IDB (downloaded once from Firebase Storage)
  const selfieDataUrl = await deps.ensureStudentSelfieCached(student);

  return recordAttendanceForStudent(student, qr, params, deps, {
    selfieDataUrl,
    selfieWarning,
    firstScan,
  });
}

export async function confirmKeyRotationAndRecord(
  qr: QrPayload,
  params: { classId: string; teacherUid: string },
  deps: ScanPipelineDeps
): Promise<ScanOutcome> {
  if (!deps.isOnline()) {
    return { status: 'REJECTED', code: 'ROTATION_OFFLINE' };
  }

  try {
    const res = await deps.approveRotation(qr, params.classId);
    await deps.putCachedStudent(res.student);
    await deps.cacheSelfieDataUrl(
      res.student.schoolStudentId,
      res.student.keyFingerprint,
      res.student.selfieHash,
      res.selfieDataUrl
    );
    return recordAttendanceForStudent(res.student, qr, params, deps, {
      selfieDataUrl: res.selfieDataUrl,
      selfieWarning: false,
      firstScan: false,
    });
  } catch (err) {
    return {
      status: 'REJECTED',
      code: 'ROTATION_FAILED',
      detail: err instanceof Error ? err.message : undefined,
    };
  }
}

async function recordAttendanceForStudent(
  student: Student,
  qr: QrPayload,
  params: { classId: string; teacherUid: string },
  deps: ScanPipelineDeps,
  flags: {
    selfieDataUrl: string | null;
    selfieWarning: boolean;
    firstScan: boolean;
  }
): Promise<ScanOutcome> {
  const sessionDate = deps.getSessionDate
    ? deps.getSessionDate()
    : getLocalSessionDate();
  const alreadyPresent = await deps.hasAttendanceForToday(
    params.classId,
    sessionDate,
    student.schoolStudentId
  );

  if (alreadyPresent) {
    return {
      status: 'DUPLICATE_IGNORED',
      student,
      qr,
      selfieDataUrl: flags.selfieDataUrl,
      selfieWarning: flags.selfieWarning,
    };
  }

  const attendance: Attendance = {
    attendanceId: crypto.randomUUID(),
    classId: params.classId,
    sessionDate,
    schoolStudentId: student.schoolStudentId,
    teacherUid: params.teacherUid,
    scannedAt: Date.now(),
    studentTs: qr.ts,
    studentKeyFingerprint: qr.fp,
    signatureValid: true,
  };

  const docId = `${params.classId}__${sessionDate}__${student.schoolStudentId}`;
  await deps.saveAttendance(attendance, docId);

  return {
    status: 'RECORDED',
    student,
    attendance,
    qr,
    selfieDataUrl: flags.selfieDataUrl,
    selfieWarning: flags.selfieWarning,
    firstScan: flags.firstScan,
  };
}
