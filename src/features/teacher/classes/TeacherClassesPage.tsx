import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import {
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  FolderPlus,
  QrCode,
  Users,
} from 'lucide-react';
import { useApp } from '../../../app/AppProvider';
import { db } from '../../../lib/firebase/client';
import {
  getAllCachedClasses,
  getCachedAttendanceByClass,
  getCachedStudent,
  putCachedAttendanceBatch,
  putCachedClass,
  putCachedClasses,
  putCachedStudent,
} from '../../../lib/idb';
import { selfieDataUrl } from '../../../lib/image/selfie';
import type { Attendance, ClassDoc, Student } from '../../../types';

interface ClassRosterState {
  loading: boolean;
  students: Student[];
  totalSessions: number;
  countsByStudent: Record<string, number>;
}

export function TeacherClassesPage() {
  const { user, isOnline } = useApp();
  const [classes, setClasses] = useState<ClassDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [newClassName, setNewClassName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedClassId, setExpandedClassId] = useState<string | null>(null);
  const [rosters, setRosters] = useState<Record<string, ClassRosterState>>({});

  useEffect(() => {
    if (!user) return;
    let active = true;

    // Seed immediately from IndexedDB so offline cold-start works instantaneously (§9)
    void getAllCachedClasses(user.uid).then((cached) => {
      if (active && cached.length > 0) {
        setClasses(cached.sort((a, b) => b.createdAt - a.createdAt));
        setLoading(false);
      }
    });

    const q = query(
      collection(db, 'classes'),
      where('teacherUid', '==', user.uid)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        if (!active) return;
        const docs = snap.docs
          .map((d) => d.data() as ClassDoc)
          .sort((a, b) => b.createdAt - a.createdAt);
        setClasses(docs);
        setLoading(false);
        void putCachedClasses(docs);
      },
      () => {
        if (active) setLoading(false);
      }
    );

    return () => {
      active = false;
      unsub();
    };
  }, [user]);

  const handleCreateClass = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const trimmed = newClassName.trim();
    if (!trimmed) return;

    setCreating(true);
    setError(null);
    try {
      const classId = crypto.randomUUID();
      const classDoc: ClassDoc = {
        classId,
        name: trimmed,
        teacherUid: user.uid,
        studentIds: [],
        createdAt: Date.now(),
      };

      await putCachedClass(classDoc);
      setClasses((prev) => [classDoc, ...prev]);
      setNewClassName('');

      const write = setDoc(doc(db, 'classes', classId), classDoc);
      if (navigator.onLine) {
        await write;
      } else {
        void write.catch(() => {});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create class.');
    } finally {
      setCreating(false);
    }
  };

  const loadRoster = async (cls: ClassDoc) => {
    if (!user) return;
    setRosters((prev) => ({
      ...prev,
      [cls.classId]: prev[cls.classId] ?? {
        loading: true,
        students: [],
        totalSessions: 0,
        countsByStudent: {},
      },
    }));

    // Parallel `get` on students/{sid} (served from Firestore cache / IDB offline) (§7.2)
    const studentResults = await Promise.all(
      cls.studentIds.map(async (sid) => {
        try {
          const snap = await getDoc(doc(db, 'students', sid));
          if (snap.exists()) {
            const student = snap.data() as Student;
            await putCachedStudent(student);
            return student;
          }
        } catch {
          // Fall through to IDB cache
        }
        return (await getCachedStudent(sid)) ?? null;
      })
    );

    const students = studentResults
      .filter((s): s is Student => s !== null)
      .sort((a, b) => a.name.localeCompare(b.name));

    let attendanceRecords: Attendance[] = [];
    try {
      if (isOnline) {
        const attQ = query(
          collection(db, 'attendance'),
          where('teacherUid', '==', user.uid),
          where('classId', '==', cls.classId)
        );
        const attSnap = await getDocs(attQ);
        attendanceRecords = attSnap.docs.map((d) => d.data() as Attendance);
        if (attendanceRecords.length > 0) {
          await putCachedAttendanceBatch(attendanceRecords);
        }
      } else {
        attendanceRecords = await getCachedAttendanceByClass(cls.classId);
      }
    } catch {
      attendanceRecords = await getCachedAttendanceByClass(cls.classId);
    }

    const sessionDates = new Set<string>();
    const countsByStudent: Record<string, number> = {};
    for (const rec of attendanceRecords) {
      sessionDates.add(rec.sessionDate);
      countsByStudent[rec.schoolStudentId] =
        (countsByStudent[rec.schoolStudentId] ?? 0) + 1;
    }

    setRosters((prev) => ({
      ...prev,
      [cls.classId]: {
        loading: false,
        students,
        totalSessions: sessionDates.size,
        countsByStudent,
      },
    }));
  };

  const toggleRoster = (cls: ClassDoc) => {
    if (expandedClassId === cls.classId) {
      setExpandedClassId(null);
      return;
    }
    setExpandedClassId(cls.classId);
    void loadRoster(cls);
  };

  return (
    <div className="stack-lg">
      <div className="row-between">
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem' }}>Your Classes</h1>
          <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
            Students join a class automatically the first time you scan their QR.
          </p>
        </div>
        <Link to="/teacher/export" className="btn">
          <FileSpreadsheet size={16} />
          Export XLSX
        </Link>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <form onSubmit={handleCreateClass} className="card stack-sm">
        <label className="label" htmlFor="new-class-name">
          Create New Class
        </label>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <input
            id="new-class-name"
            className="input"
            style={{ flex: 1, minWidth: 200 }}
            placeholder="e.g. Biology 12 – Group A"
            value={newClassName}
            onChange={(e) => setNewClassName(e.target.value)}
            required
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={creating}
          >
            <FolderPlus size={16} />
            {creating ? 'Creating…' : 'Create Class'}
          </button>
        </div>
      </form>

      {loading ? (
        <div className="card">
          <p className="muted">Loading classes…</p>
        </div>
      ) : classes.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            No classes yet. Create your first class above, then start scanning
            student QRs.
          </p>
        </div>
      ) : (
        <div className="stack-md">
          {classes.map((cls) => {
            const isExpanded = expandedClassId === cls.classId;
            const roster = rosters[cls.classId];

            return (
              <div key={cls.classId} className="card stack-md">
                <div className="row-between">
                  <div>
                    <h2 style={{ margin: 0, fontSize: '1.15rem' }}>{cls.name}</h2>
                    <span className="muted" style={{ fontSize: '0.85rem' }}>
                      {cls.studentIds.length}{' '}
                      {cls.studentIds.length === 1 ? 'student' : 'students'}
                    </span>
                  </div>

                  <div className="row" style={{ flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => toggleRoster(cls)}
                    >
                      <Users size={15} />
                      Roster
                      {isExpanded ? (
                        <ChevronUp size={15} />
                      ) : (
                        <ChevronDown size={15} />
                      )}
                    </button>
                    <Link
                      to={`/teacher/scan/${cls.classId}`}
                      className="btn btn-sm btn-primary"
                    >
                      <QrCode size={15} />
                      Scan Attendance
                    </Link>
                  </div>
                </div>

                {isExpanded && (
                  <div
                    style={{
                      borderTop: '1px solid var(--border)',
                      paddingTop: '0.9rem',
                    }}
                    className="stack-sm"
                  >
                    {roster?.loading ? (
                      <p className="muted">Loading roster from cache…</p>
                    ) : !roster || roster.students.length === 0 ? (
                      <p className="muted" style={{ margin: 0 }}>
                        No students in this class yet. Scan a student&apos;s QR
                        while online to add them.
                      </p>
                    ) : (
                      <div className="stack-sm">
                        <div className="muted" style={{ fontSize: '0.85rem' }}>
                          Recorded sessions: {roster.totalSessions}
                        </div>
                        {roster.students.map((st) => {
                          const attended =
                            roster.countsByStudent[st.schoolStudentId] ?? 0;
                          const pct =
                            roster.totalSessions > 0
                              ? Math.round(
                                  (attended / roster.totalSessions) * 100
                                )
                              : 0;
                          return (
                            <div
                              key={st.schoolStudentId}
                              className="row-between"
                              style={{
                                padding: '0.5rem 0.75rem',
                                borderRadius: 10,
                                background: 'var(--bg-muted)',
                              }}
                            >
                              <div className="row">
                                <img
                                  src={selfieDataUrl(st.selfieThumb)}
                                  alt={st.name}
                                  className="avatar"
                                  style={{ width: 42, height: 42 }}
                                />
                                <div>
                                  <div style={{ fontWeight: 600 }}>{st.name}</div>
                                  <div
                                    className="mono muted"
                                    style={{ fontSize: '0.8rem' }}
                                  >
                                    {st.schoolStudentId} · FP {st.keyFingerprint}
                                  </div>
                                </div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontWeight: 600 }}>
                                  {attended}/{roster.totalSessions}
                                </div>
                                <div
                                  className="muted"
                                  style={{ fontSize: '0.78rem' }}
                                >
                                  {pct}%
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
