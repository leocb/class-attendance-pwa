import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { ArrowLeft, Download, FileSpreadsheet } from 'lucide-react';
import { useApp } from '../../../app/AppProvider';
import { db } from '../../../lib/firebase/client';
import {
  getAllCachedClasses,
  getAllCachedStudents,
  getCachedAttendanceByClass,
  putCachedAttendanceBatch,
  putCachedClasses,
} from '../../../lib/idb';
import {
  buildAttendanceWorkbook,
  downloadWorkbookXlsx,
  generateExportFilename,
  type ExportClassBundle,
} from '../../../lib/excel/exportAttendance';
import { getLocalSessionDate } from '../../../lib/time';
import type { Attendance, ClassDoc, Student } from '../../../types';

export function TeacherExportPage() {
  const { user, isOnline } = useApp();
  const [classes, setClasses] = useState<ClassDoc[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [allTime, setAllTime] = useState(true);
  const [fromDate, setFromDate] = useState(getLocalSessionDate());
  const [toDate, setToDate] = useState(getLocalSessionDate());
  const [includeSummary, setIncludeSummary] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;

    void (async () => {
      const cached = await getAllCachedClasses(user.uid);
      if (active && cached.length > 0) {
        const sorted = cached.sort((a, b) => b.createdAt - a.createdAt);
        setClasses(sorted);
        setSelectedIds(new Set(sorted.map((c) => c.classId)));
      }

      if (navigator.onLine) {
        try {
          const snap = await getDocs(
            query(collection(db, 'classes'), where('teacherUid', '==', user.uid))
          );
          if (!active) return;
          const remote = snap.docs
            .map((d) => d.data() as ClassDoc)
            .sort((a, b) => b.createdAt - a.createdAt);
          setClasses(remote);
          setSelectedIds(new Set(remote.map((c) => c.classId)));
          await putCachedClasses(remote);
        } catch {
          // Use IDB cache
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [user]);

  const toggleClass = (classId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(classId)) next.delete(classId);
      else next.add(classId);
      return next;
    });
  };

  const handleExport = async () => {
    if (!user) return;
    setError(null);
    setSuccess(null);

    const chosenClasses = classes.filter((c) => selectedIds.has(c.classId));
    if (chosenClasses.length === 0) {
      setError('Select at least one class to export.');
      return;
    }

    setExporting(true);
    try {
      const allStudents = await getAllCachedStudents();
      const studentById = new Map<string, Student>(
        allStudents.map((s) => [s.schoolStudentId, s])
      );

      const bundles: ExportClassBundle[] = await Promise.all(
        chosenClasses.map(async (cls) => {
          let attendance: Attendance[] = [];
          if (isOnline) {
            try {
              const snap = await getDocs(
                query(
                  collection(db, 'attendance'),
                  where('teacherUid', '==', user.uid),
                  where('classId', '==', cls.classId)
                )
              );
              attendance = snap.docs.map((d) => d.data() as Attendance);
              if (attendance.length > 0) {
                await putCachedAttendanceBatch(attendance);
              }
            } catch {
              attendance = await getCachedAttendanceByClass(cls.classId);
            }
          } else {
            // Works 100% offline from IndexedDB (§10)
            attendance = await getCachedAttendanceByClass(cls.classId);
          }

          const students = cls.studentIds
            .map((sid) => studentById.get(sid))
            .filter((s): s is Student => Boolean(s));

          return {
            classDoc: cls,
            students,
            attendance,
          };
        })
      );

      const from = allTime ? null : fromDate;
      const to = allTime ? null : toDate;
      const workbook = await buildAttendanceWorkbook({
        bundles,
        fromDate: from,
        toDate: to,
        includeSummary,
      });
      const filename = await generateExportFilename(from, to);
      await downloadWorkbookXlsx(workbook, filename);
      setSuccess(`Exported ${filename} (${chosenClasses.length} class sheet${chosenClasses.length > 1 ? 's' : ''}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Excel export failed.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="stack-lg">
      <div className="row">
        <Link to="/teacher/classes" className="btn btn-sm">
          <ArrowLeft size={15} />
          Classes
        </Link>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.35rem' }}>
            Export Attendance (XLSX)
          </h1>
          <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
            Generated completely in-browser from local IndexedDB cache. Works
            offline.
          </p>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="card stack-md">
        <div className="row">
          <FileSpreadsheet size={20} />
          <strong>Select Classes</strong>
        </div>

        {classes.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No cached classes available yet.
          </p>
        ) : (
          <div className="stack-sm">
            {classes.map((cls) => (
              <label
                key={cls.classId}
                className="row"
                style={{
                  padding: '0.55rem 0.75rem',
                  borderRadius: 10,
                  background: 'var(--bg-muted)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(cls.classId)}
                  onChange={() => toggleClass(cls.classId)}
                />
                <span style={{ fontWeight: 600 }}>{cls.name}</span>
                <span className="muted" style={{ fontSize: '0.85rem' }}>
                  ({cls.studentIds.length} students)
                </span>
              </label>
            ))}
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }} className="stack-sm">
          <label className="row" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={allTime}
              onChange={(e) => setAllTime(e.target.checked)}
            />
            <strong>All time</strong>
          </label>

          {!allTime && (
            <div className="grid-2">
              <div>
                <label className="label" htmlFor="export-from">
                  From Date
                </label>
                <input
                  id="export-from"
                  type="date"
                  className="input"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="export-to">
                  To Date
                </label>
                <input
                  id="export-to"
                  type="date"
                  className="input"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>
            </div>
          )}

          <label className="row" style={{ cursor: 'pointer', marginTop: '0.35rem' }}>
            <input
              type="checkbox"
              checked={includeSummary}
              onChange={(e) => setIncludeSummary(e.target.checked)}
            />
            <span>Include &ldquo;Summary&rdquo; sheet across selected classes</span>
          </label>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          disabled={exporting || classes.length === 0}
          onClick={handleExport}
        >
          <Download size={16} />
          {exporting ? 'Building XLSX…' : 'Download Attendance XLSX'}
        </button>
      </div>
    </div>
  );
}
