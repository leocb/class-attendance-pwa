import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  FolderPlus,
  MoreVertical,
  Pencil,
  QrCode,
  User,
  Users,
} from 'lucide-react';
import { useApp } from '../../../app/AppProvider';
import { db } from '../../../lib/firebase/client';
import { ensureStudentSelfieCached } from '../../../lib/firebase/storage';
import { callManageClass } from '../../../lib/firebase/functions';
import { errorMessage } from '../../../lib/errors';
import {
  getAllCachedClasses,
  getCachedAttendanceByClass,
  getCachedStudent,
  putCachedAttendanceBatch,
  putCachedClass,
  putCachedClasses,
  putCachedStudent,
} from '../../../lib/idb';
import { useI18n } from '../../../lib/i18n';
import {
  SelfieZoomModal,
  type ZoomedSelfie,
} from '../../../components/SelfieZoomModal';
import type { Attendance, ClassDoc, Student } from '../../../types';

interface ClassRosterState {
  loading: boolean;
  students: Student[];
  selfieUrls: Record<string, string>;
  totalSessions: number;
  countsByStudent: Record<string, number>;
}

export function TeacherClassesPage() {
  const { user, isOnline } = useApp();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [classes, setClasses] = useState<ClassDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [newClassName, setNewClassName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedClassId, setExpandedClassId] = useState<string | null>(null);
  const [rosters, setRosters] = useState<Record<string, ClassRosterState>>({});
  const [zoomedSelfie, setZoomedSelfie] = useState<ZoomedSelfie | null>(null);
  const [openMenuClassId, setOpenMenuClassId] = useState<string | null>(null);
  const [renamingClassId, setRenamingClassId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [busyClassId, setBusyClassId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;

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

  useEffect(() => {
    if (!openMenuClassId) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(`[data-class-menu="${openMenuClassId}"]`)) {
        setOpenMenuClassId(null);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [openMenuClassId]);

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
      setError(errorMessage(err, t, 'errClassCreate'));
    } finally {
      setCreating(false);
    }
  };

  const requireOnline = (): boolean => {
    if (isOnline) return true;
    setError(t('errClassOffline'));
    return false;
  };

  const startRename = (cls: ClassDoc) => {
    setOpenMenuClassId(null);
    setRenamingClassId(cls.classId);
    setRenameValue(cls.name);
  };

  const cancelRename = () => {
    setRenamingClassId(null);
    setRenameValue('');
  };

  const saveRename = async (e: FormEvent) => {
    e.preventDefault();
    if (!renamingClassId) return;
    const name = renameValue.trim();
    if (!name || !requireOnline()) return;

    const classId = renamingClassId;
    setBusyClassId(classId);
    setError(null);
    try {
      const res = await callManageClass(classId, 'rename', name);
      const nextName = res.name ?? name;
      const current = classes.find((c) => c.classId === classId);
      setClasses((prev) =>
        prev.map((c) => (c.classId === classId ? { ...c, name: nextName } : c))
      );
      if (current) await putCachedClass({ ...current, name: nextName });
      cancelRename();
    } catch (err) {
      setError(errorMessage(err, t, 'errClassRename'));
    } finally {
      setBusyClassId(null);
    }
  };

  const toggleArchive = async (cls: ClassDoc) => {
    setOpenMenuClassId(null);
    if (!requireOnline()) return;

    setBusyClassId(cls.classId);
    setError(null);
    try {
      const res = await callManageClass(
        cls.classId,
        cls.archived ? 'unarchive' : 'archive'
      );
      const archived = res.archived === true;
      setClasses((prev) =>
        prev.map((c) =>
          c.classId === cls.classId
            ? { ...c, archived, archivedAt: archived ? Date.now() : null }
            : c
        )
      );
      await putCachedClass({
        ...cls,
        archived,
        archivedAt: archived ? Date.now() : null,
      });
      if (archived && expandedClassId === cls.classId) setExpandedClassId(null);
    } catch (err) {
      setError(errorMessage(err, t, 'errClassArchive'));
    } finally {
      setBusyClassId(null);
    }
  };

  const exportClass = (cls: ClassDoc) => {
    setOpenMenuClassId(null);
    navigate(`/teacher/export?classId=${encodeURIComponent(cls.classId)}`);
  };

  const loadRoster = async (cls: ClassDoc) => {
    if (!user) return;
    setRosters((prev) => ({
      ...prev,
      [cls.classId]: prev[cls.classId] ?? {
        loading: true,
        students: [],
        selfieUrls: {},
        totalSessions: 0,
        countsByStudent: {},
      },
    }));

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

    const selfieEntries = await Promise.all(
      students.map(async (st) => {
        const url = await ensureStudentSelfieCached(st);
        return [st.schoolStudentId, url] as const;
      })
    );
    const selfieUrls: Record<string, string> = {};
    for (const [sid, url] of selfieEntries) {
      if (url) selfieUrls[sid] = url;
    }

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
        selfieUrls,
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

  const renderClassCard = (cls: ClassDoc) => {
    const isExpanded = expandedClassId === cls.classId;
    const roster = rosters[cls.classId];
    const isRenaming = renamingClassId === cls.classId;
    const menuOpen = openMenuClassId === cls.classId;

    return (
      <div key={cls.classId} className="card stack-md">
        <div className="row-between">
          <div style={{ flex: 1, minWidth: 0 }}>
            {isRenaming ? (
              <form
                onSubmit={saveRename}
                className="row"
                style={{ gap: '0.4rem', flexWrap: 'wrap' }}
              >
                <input
                  className="input"
                  style={{ maxWidth: 280, flex: 1, minWidth: 160 }}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  maxLength={120}
                  required
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') cancelRename();
                  }}
                />
                <button
                  type="submit"
                  className="btn btn-sm btn-primary"
                  disabled={busyClassId === cls.classId}
                >
                  {t('save')}
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={cancelRename}
                >
                  {t('cancel')}
                </button>
              </form>
            ) : (
              <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '1.15rem' }}>{cls.name}</h2>
                {cls.archived && (
                  <span className="badge badge-offline">{t('archived')}</span>
                )}
              </div>
            )}
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              {cls.studentIds.length}{' '}
              {cls.studentIds.length === 1
                ? t('studentSingular')
                : t('studentPlural')}
            </span>
          </div>

          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => toggleRoster(cls)}
            >
              <Users size={15} />
              {t('roster')}
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
              {t('scanAttendance')}
            </Link>

            <div
              style={{ position: 'relative', zIndex: menuOpen ? 30 : undefined }}
              data-class-menu={cls.classId}
            >
              <button
                type="button"
                className="btn btn-sm"
                aria-label={t('moreActions')}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                title={t('moreActions')}
                disabled={busyClassId === cls.classId}
                onClick={() =>
                  setOpenMenuClassId((prev) =>
                    prev === cls.classId ? null : cls.classId
                  )
                }
              >
                <MoreVertical size={16} />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="card"
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: 'calc(100% + 6px)',
                    minWidth: 185,
                    padding: '0.35rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.15rem',
                    boxShadow: 'var(--shadow)',
                  }}
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="btn btn-sm"
                    style={{ justifyContent: 'flex-start', border: 'none' }}
                    onClick={() => startRename(cls)}
                  >
                    <Pencil size={14} />
                    {t('rename')}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="btn btn-sm"
                    style={{ justifyContent: 'flex-start', border: 'none' }}
                    onClick={() => void toggleArchive(cls)}
                  >
                    {cls.archived ? (
                      <ArchiveRestore size={14} />
                    ) : (
                      <Archive size={14} />
                    )}
                    {cls.archived ? t('unarchive') : t('archive')}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="btn btn-sm"
                    style={{ justifyContent: 'flex-start', border: 'none' }}
                    onClick={() => exportClass(cls)}
                  >
                    <FileSpreadsheet size={14} />
                    {t('export')}
                  </button>
                </div>
              )}
            </div>
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
              <p className="muted">{t('loadingRoster')}</p>
            ) : !roster || roster.students.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                {t('noStudentsInClass')}
              </p>
            ) : (
              <div className="stack-sm">
                <div className="muted" style={{ fontSize: '0.85rem' }}>
                  {t('recordedSessions')}: {roster.totalSessions}
                </div>
                {roster.students.map((st) => {
                  const attended =
                    roster.countsByStudent[st.schoolStudentId] ?? 0;
                  const pct =
                    roster.totalSessions > 0
                      ? Math.round((attended / roster.totalSessions) * 100)
                      : 0;
                  const selfieUrl = roster.selfieUrls[st.schoolStudentId];
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
                        {selfieUrl ? (
                          <button
                            type="button"
                            onClick={() =>
                              setZoomedSelfie({
                                src: selfieUrl,
                                alt: st.name,
                                caption: `${st.name} (${st.schoolStudentId})`,
                              })
                            }
                            title={t('tapToZoom')}
                            aria-label={`${st.name} — ${t('tapToZoom')}`}
                            style={{
                              padding: 0,
                              border: 'none',
                              background: 'transparent',
                              cursor: 'zoom-in',
                              borderRadius: 12,
                            }}
                          >
                            <img
                              src={selfieUrl}
                              alt={st.name}
                              className="avatar"
                              style={{ width: 42, height: 42 }}
                            />
                          </button>
                        ) : (
                          <div
                            className="avatar"
                            style={{
                              width: 42,
                              height: 42,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <User size={18} />
                          </div>
                        )}
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
                        <div className="muted" style={{ fontSize: '0.78rem' }}>
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
  };

  const activeClasses = classes.filter((c) => !c.archived);
  const archivedClasses = classes.filter((c) => c.archived);

  return (
    <div className="stack-lg">
      <div className="row-between">
        <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{t('yourClasses')}</h1>
        <Link to="/teacher/export" className="btn">
          <FileSpreadsheet size={16} />
          {t('exportXlsx')}
        </Link>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <form onSubmit={handleCreateClass} className="card stack-sm">
        <label className="label" htmlFor="new-class-name">
          {t('createNewClass')}
        </label>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <input
            id="new-class-name"
            className="input"
            style={{ flex: 1, minWidth: 200 }}
            placeholder={t('classNamePlaceholder')}
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
            {creating ? t('creatingClass') : t('createClass')}
          </button>
        </div>
      </form>

      {loading ? (
        <div className="card">
          <p className="muted">{t('loadingClasses')}</p>
        </div>
      ) : classes.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            {t('noClassesYet')}
          </p>
        </div>
      ) : (
        <div className="stack-md">
          {activeClasses.map(renderClassCard)}

          {archivedClasses.length > 0 && (
            <button
              type="button"
              className="btn btn-sm"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => setShowArchived((prev) => !prev)}
            >
              <Archive size={14} />
              {showArchived
                ? t('hideArchived')
                : t('showArchived', { count: archivedClasses.length })}
            </button>
          )}
          {showArchived && archivedClasses.map(renderClassCard)}
        </div>
      )}

      <SelfieZoomModal
        image={zoomedSelfie}
        onClose={() => setZoomedSelfie(null)}
      />
    </div>
  );
}
