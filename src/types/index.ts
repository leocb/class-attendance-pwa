export interface RotatedKeyEntry {
  fingerprint: string;
  publicKeyJwk: JsonWebKey;
  replacedAt: number;
}

export interface Student {
  schoolStudentId: string;
  name: string;
  deviceUid: string;
  publicKeyJwk: JsonWebKey;
  keyFingerprint: string;
  selfieThumb: string;
  selfieHash: string;
  registrationTimestamp: number;
  authorizedTeacherUids: string[];
  rotatedKeys: RotatedKeyEntry[];
}

export interface ClassDoc {
  classId: string;
  name: string;
  teacherUid: string;
  studentIds: string[];
  createdAt: number;
}

export interface Attendance {
  attendanceId: string;
  classId: string;
  sessionDate: string; // YYYY-MM-DD (local date)
  schoolStudentId: string;
  teacherUid: string;
  scannedAt: number; // teacher device time (unix ms)
  studentTs: number; // ts from QR (estimated server time, unix seconds)
  studentKeyFingerprint: string;
  signatureValid: boolean;
}

export interface QrPayload {
  v: 1;
  sid: string;
  n: string;
  ts: number;
  nce: string;
  fp: string;
  sig: string;
  img?: string;
  pk?: JsonWebKey;
}

export interface StudentProfile {
  schoolStudentId: string;
  name: string;
  deviceUid: string;
  publicKeyJwk: JsonWebKey;
  keyFingerprint: string;
  selfieThumb: string;
  selfieHash: string;
  registrationTimestamp: number;
  isRecovery: boolean;
  firestoreSynced: boolean;
}

export interface ServerOffsetRecord {
  serverOffset: number; // serverMs - deviceMs
  offsetSyncedAt: number; // deviceMs
}

export interface CachedClassRoster {
  classDoc: ClassDoc;
  updatedAt: number;
}
