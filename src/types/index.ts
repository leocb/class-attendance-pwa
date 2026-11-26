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
  selfiePath: string; // Firebase Storage path: selfies/{sid}/{fp}.webp
  selfieHash: string; // hex SHA-256 of WebP bytes
  teacherUid?: string; // owner teacher (records are scoped per teacher)
  registrationTimestamp: number;
  rotatedKeys: RotatedKeyEntry[];
  lastRotationNonce?: string;
  lastRotationTs?: number;
}

export interface ClassDoc {
  classId: string;
  name: string;
  teacherUid: string;
  studentIds: string[];
  createdAt: number;
  /** Set by the manageClass Cloud Function; archived classes are hidden by default. */
  archived?: boolean;
  archivedAt?: number | null;
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
  sh: string; // SHA-256 hex of student's WebP selfie stored in Firebase Storage
  sig: string;
  pk?: JsonWebKey;
}

export interface StudentProfile {
  schoolStudentId: string;
  name: string;
  deviceUid: string;
  publicKeyJwk: JsonWebKey;
  keyFingerprint: string;
  selfiePath: string;
  selfieHash: string;
  selfieDataUrl: string; // Local preview cached on student device
  selfieBytes?: Uint8Array; // Pending upload bytes if created offline
  selfieUploaded: boolean;
  registrationTimestamp: number;
  isRecovery: boolean;
}

export interface CachedSelfie {
  cacheKey: string; // `${sid}__${fp}`
  schoolStudentId: string;
  keyFingerprint: string;
  selfieHash: string;
  dataUrl: string;
  updatedAt: number;
}

export interface ServerOffsetRecord {
  serverOffset: number; // serverMs - deviceMs
  offsetSyncedAt: number; // deviceMs
}
