import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  Attendance,
  CachedSelfie,
  ClassDoc,
  ServerOffsetRecord,
  Student,
  StudentProfile,
} from '../../types';

interface AttendanceDBSchema extends DBSchema {
  kv: {
    key: string;
    value: StudentProfile | CryptoKey | ServerOffsetRecord;
  };
  'cache:students': {
    key: string;
    value: Student;
  };
  'cache:selfies': {
    key: string;
    value: CachedSelfie;
  };
  'cache:classes': {
    key: string;
    value: ClassDoc;
  };
  'cache:attendance': {
    key: string;
    value: Attendance;
    indexes: {
      'by-class': string;
      'by-class-date': [string, string];
    };
  };
}

const DB_NAME = 'class-attendance-db';
const DB_VERSION = 2;

export const KV_KEYS = {
  STUDENT_PROFILE: 'student-profile',
  STUDENT_PRIVATE_KEY: 'student-private-key',
  SERVER_OFFSET: 'server-offset',
} as const;

let dbPromise: Promise<IDBPDatabase<AttendanceDBSchema>> | null = null;

export function getDb(): Promise<IDBPDatabase<AttendanceDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<AttendanceDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('kv')) {
          db.createObjectStore('kv');
        }
        if (!db.objectStoreNames.contains('cache:students')) {
          db.createObjectStore('cache:students', { keyPath: 'schoolStudentId' });
        }
        if (!db.objectStoreNames.contains('cache:selfies')) {
          db.createObjectStore('cache:selfies', { keyPath: 'cacheKey' });
        }
        if (!db.objectStoreNames.contains('cache:classes')) {
          db.createObjectStore('cache:classes', { keyPath: 'classId' });
        }
        if (!db.objectStoreNames.contains('cache:attendance')) {
          const store = db.createObjectStore('cache:attendance', {
            keyPath: 'attendanceId',
          });
          store.createIndex('by-class', 'classId');
          store.createIndex('by-class-date', ['classId', 'sessionDate']);
        }
      },
    });
  }
  return dbPromise;
}

export async function getStudentProfile(): Promise<StudentProfile | undefined> {
  const db = await getDb();
  return (await db.get('kv', KV_KEYS.STUDENT_PROFILE)) as StudentProfile | undefined;
}

export async function saveStudentProfile(profile: StudentProfile): Promise<void> {
  const db = await getDb();
  await db.put('kv', profile, KV_KEYS.STUDENT_PROFILE);
}

export async function getStudentPrivateKey(): Promise<CryptoKey | undefined> {
  const db = await getDb();
  return (await db.get('kv', KV_KEYS.STUDENT_PRIVATE_KEY)) as CryptoKey | undefined;
}

/**
 * Stores the non-extractable student private key on initial registration.
 * Refuses to overwrite an existing key.
 */
export async function saveStudentPrivateKeyInitial(privateKey: CryptoKey): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('kv', 'readwrite');
  const existing = await tx.store.get(KV_KEYS.STUDENT_PRIVATE_KEY);
  if (existing) {
    tx.abort();
    throw new Error(
      'A student private key already exists on this device. Use recovery to rotate keys.'
    );
  }
  await tx.store.put(privateKey, KV_KEYS.STUDENT_PRIVATE_KEY);
  await tx.done;
}

/**
 * Replaces the student private key explicitly during the recovery flow.
 */
export async function replaceStudentPrivateKeyForRecovery(
  privateKey: CryptoKey
): Promise<void> {
  const db = await getDb();
  await db.put('kv', privateKey, KV_KEYS.STUDENT_PRIVATE_KEY);
}

export async function getServerOffset(): Promise<ServerOffsetRecord | undefined> {
  const db = await getDb();
  return (await db.get('kv', KV_KEYS.SERVER_OFFSET)) as ServerOffsetRecord | undefined;
}

export async function saveServerOffset(record: ServerOffsetRecord): Promise<void> {
  const db = await getDb();
  await db.put('kv', record, KV_KEYS.SERVER_OFFSET);
}

// Teacher caches
export async function getCachedStudent(
  schoolStudentId: string
): Promise<Student | undefined> {
  const db = await getDb();
  return db.get('cache:students', schoolStudentId);
}

export async function putCachedStudent(student: Student): Promise<void> {
  const db = await getDb();
  await db.put('cache:students', student);
}

export async function getAllCachedStudents(): Promise<Student[]> {
  const db = await getDb();
  return db.getAll('cache:students');
}

export function selfieCacheKey(sid: string, fp: string): string {
  return `${sid}__${fp}`;
}

export async function getCachedSelfie(
  sid: string,
  fp: string
): Promise<CachedSelfie | undefined> {
  const db = await getDb();
  return db.get('cache:selfies', selfieCacheKey(sid, fp));
}

export async function putCachedSelfie(selfie: CachedSelfie): Promise<void> {
  const db = await getDb();
  await db.put('cache:selfies', selfie);
}

export async function getCachedClass(classId: string): Promise<ClassDoc | undefined> {
  const db = await getDb();
  return db.get('cache:classes', classId);
}

export async function getAllCachedClasses(teacherUid?: string): Promise<ClassDoc[]> {
  const db = await getDb();
  const all = await db.getAll('cache:classes');
  return teacherUid ? all.filter((c) => c.teacherUid === teacherUid) : all;
}

export async function putCachedClass(classDoc: ClassDoc): Promise<void> {
  const db = await getDb();
  await db.put('cache:classes', classDoc);
}

export async function putCachedClasses(classDocs: ClassDoc[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('cache:classes', 'readwrite');
  await Promise.all(classDocs.map((c) => tx.store.put(c)));
  await tx.done;
}

export async function putCachedAttendance(record: Attendance): Promise<void> {
  const db = await getDb();
  await db.put('cache:attendance', record);
}

export async function putCachedAttendanceBatch(records: Attendance[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('cache:attendance', 'readwrite');
  await Promise.all(records.map((r) => tx.store.put(r)));
  await tx.done;
}

export async function getCachedAttendanceByClass(classId: string): Promise<Attendance[]> {
  const db = await getDb();
  return db.getAllFromIndex('cache:attendance', 'by-class', classId);
}

export async function getCachedAttendanceByClassAndDate(
  classId: string,
  sessionDate: string
): Promise<Attendance[]> {
  const db = await getDb();
  return db.getAllFromIndex('cache:attendance', 'by-class-date', [classId, sessionDate]);
}
