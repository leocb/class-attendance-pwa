import {
  buildCanonicalSignString,
  sha256Hex,
  verifyCanonicalSignature,
} from '../../../lib/crypto';
import {
  getEstimatedServerNowSec,
  getLocalSessionDate,
  isTimestampFresh,
} from '../../../lib/time';
import { parseQrPayload } from '../../../lib/validation/qrSchema';
import type { Attendance, QrPayload, Student } from '../../../types';

export interface ScanPipelineDeps {
  isOnline: () => boolean;
  getCachedStudent: (sid: string) => Promise<Student | undefined>;
  putCachedStudent: (student: Student) => Promise<void>;
  registerFirstScan: (
    qr: QrPayload,
    classId: string
  ) => Promise<{
    status: 'REGISTERED' | 'ROTATION_REQUIRED';
    student: Student;
  }>;
  approveRotation: (
    qr: QrPayload,
    classId: string
  ) => Promise<{ status: 'ROTATED'; student: Student }>;
  hasAttendanceForToday: (
    classId: string,
    sessionDate: string,
    sid: string
  ) => Promise<boolean>;
  saveAttendance: (record: Attendance, docId: string) => Promise<void>;
  getEstimatedNowSec?: () => Promise<number>;
  getSessionDate?: () => string;
  classStudentIds?: string[];
}

export type ScanOutcome =
  | {
      status: 'RECORDED';
      student: Student;
      attendance: Attendance;
      qr: QrPayload;
      selfieWarning: boolean;
      firstScan: boolean;
    }
  | {
      status: 'DUPLICATE_IGNORED';
      student: Student;
      qr: QrPayload;
      selfieWarning: boolean;
    }
  | {
      status: 'ROTATION_NEEDED';
      qr: QrPayload;
      storedStudent: Student;
    }
  | {
      status: 'REJECTED';
      reason: string;
    };

export async function processScannedQr(
  rawQr: string,
  params: { classId: string; teacherUid: string },
  deps: ScanPipelineDeps
): Promise<ScanOutcome> {
  // 1. Schema check with zod (§7.3 step 1)
  const qr = parseQrPayload(rawQr);
  if (!qr) {
    return { status: 'REJECTED', reason: 'Malformed QR payload.' };
  }

  // 2. Look up student in local cache by sid (§7.3 step 2)
  let student = await deps.getCachedStudent(qr.sid);
  let firstScan = false;

  if (!student) {
    if (!deps.isOnline()) {
      return {
        status: 'REJECTED',
        reason:
          'First scan requires internet. Please connect once to register this student.',
      };
    }

    try {
      const res = await deps.registerFirstScan(qr, params.classId);
      if (res.status === 'ROTATION_REQUIRED') {
        return {
          status: 'ROTATION_NEEDED',
          qr,
          storedStudent: res.student,
        };
      }
      student = res.student;
      firstScan = true;
      await deps.putCachedStudent(student);
    } catch (err) {
      return {
        status: 'REJECTED',
        reason:
          err instanceof Error
            ? err.message
            : 'Failed to register student on first scan.',
      };
    }
  } else if (qr.fp !== student.keyFingerprint) {
    // 3. Key fingerprint changed -> rotation path (§7.3 step 3)
    if (!deps.isOnline()) {
      return {
        status: 'REJECTED',
        reason: 'Key rotation requires internet. Please connect.',
      };
    }
    return {
      status: 'ROTATION_NEEDED',
      qr,
      storedStudent: student,
    };
  }

  // 4. Local ECDSA signature verify (§7.3 step 4)
  if (!firstScan) {
    const imgHash = await sha256Hex(qr.img ?? '');
    const canonical = buildCanonicalSignString({
      sid: qr.sid,
      n: qr.n,
      ts: qr.ts,
      nce: qr.nce,
      fp: qr.fp,
      imgHash,
    });
    const sigOk = await verifyCanonicalSignature(
      student.publicKeyJwk,
      canonical,
      qr.sig
    );
    if (!sigOk) {
      return {
        status: 'REJECTED',
        reason: 'Invalid cryptographic signature.',
      };
    }

    // 5. Timestamp freshness: |teacherEstimatedNow - qr.ts| <= 180s (§7.3 step 5)
    const nowSec = deps.getEstimatedNowSec
      ? await deps.getEstimatedNowSec()
      : await getEstimatedServerNowSec();
    if (!isTimestampFresh(qr.ts, nowSec)) {
      return {
        status: 'REJECTED',
        reason: 'QR code expired (older than 180 seconds). Ask student to show live QR.',
      };
    }

    // If student was already cached from another class, sync membership to this class when online
    if (
      deps.isOnline() &&
      deps.classStudentIds &&
      !deps.classStudentIds.includes(qr.sid)
    ) {
      void deps.registerFirstScan(qr, params.classId).catch(() => {});
    }
  }

  // 6. Selfie consistency check (§7.3 step 6: warn, don't hard-reject)
  let selfieWarning = false;
  if (qr.img !== undefined) {
    const qrImgHash = await sha256Hex(qr.img);
    if (qrImgHash !== student.selfieHash) {
      selfieWarning = true;
    }
  }

  // 7. Record attendance (§7.3 step 7)
  return recordAttendanceForStudent(student, qr, params, deps, {
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
    return {
      status: 'REJECTED',
      reason: 'Key rotation requires internet. Please connect.',
    };
  }

  try {
    const res = await deps.approveRotation(qr, params.classId);
    await deps.putCachedStudent(res.student);
    return recordAttendanceForStudent(res.student, qr, params, deps, {
      selfieWarning: false,
      firstScan: false,
    });
  } catch (err) {
    return {
      status: 'REJECTED',
      reason:
        err instanceof Error ? err.message : 'Key rotation approval failed.',
    };
  }
}

async function recordAttendanceForStudent(
  student: Student,
  qr: QrPayload,
  params: { classId: string; teacherUid: string },
  deps: ScanPipelineDeps,
  flags: { selfieWarning: boolean; firstScan: boolean }
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
    selfieWarning: flags.selfieWarning,
    firstScan: flags.firstScan,
  };
}
