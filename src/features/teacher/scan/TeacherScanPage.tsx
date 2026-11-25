import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import { useApp } from '../../../app/AppProvider';
import { db } from '../../../lib/firebase/client';
import {
  callApproveRotation,
  callRegisterFirstScan,
} from '../../../lib/firebase/functions';
import {
  getCachedAttendanceByClassAndDate,
  getCachedClass,
  getCachedStudent,
  putCachedAttendance,
  putCachedAttendanceBatch,
  putCachedClass,
  putCachedStudent,
} from '../../../lib/idb';
import { selfieDataUrl } from '../../../lib/image/selfie';
import { getLocalSessionDate } from '../../../lib/time';
import type { Attendance, ClassDoc, QrPayload, Student } from '../../../types';
import {
  confirmKeyRotationAndRecord,
  processScannedQr,
  type ScanOutcome,
  type ScanPipelineDeps,
} from './scanPipeline';

interface RotationModalState {
  qr: QrPayload;
  storedStudent: Student;
}

export function TeacherScanPage() {
  const { classId } = useParams<{ classId: string }>();
  const { user, isOnline } = useApp();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const busyDecodingRef = useRef(false);
  const processingScanRef = useRef(false);
  const lastDecodedRawRef = useRef<{ raw: string; at: number } | null>(null);

  const [classDoc, setClassDoc] = useState<ClassDoc | null>(null);
  const [todayAttendance, setTodayAttendance] = useState<Attendance[]>([]);
  const [studentMap, setStudentMap] = useState<Record<string, Student>>({});
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'warning' | 'danger';
    message: string;
  } | null>(null);
  const [confirmedCard, setConfirmedCard] = useState<{
    student: Student;
    qr: QrPayload;
    selfieWarning: boolean;
    firstScan: boolean;
    duplicate?: boolean;
  } | null>(null);
  const [rotationModal, setRotationModal] =
    useState<RotationModalState | null>(null);
  const [rotationBusy, setRotationBusy] = useState(false);

  const today = getLocalSessionDate();
  const seenTodayRef = useRef<Set<string>>(new Set());

  // Sync todayAttendance set into ref for instant duplicate checks
  useEffect(() => {
    const next = new Set<string>();
    for (const rec of todayAttendance) {
      next.add(rec.schoolStudentId);
    }
    seenTodayRef.current = next;
  }, [todayAttendance]);

  // Load class + today's attendance + real-time listeners (§7.4)
  useEffect(() => {
    if (!user || !classId) return;
    let active = true;

    void getCachedClass(classId).then((cached) => {
      if (active && cached) setClassDoc(cached);
    });

    void getCachedAttendanceByClassAndDate(classId, today).then((cached) => {
      if (active && cached.length > 0) {
        setTodayAttendance(cached.sort((a, b) => b.scannedAt - a.scannedAt));
      }
    });

    const unsubClass = onSnapshot(doc(db, 'classes', classId), (snap) => {
      if (!active || !snap.exists()) return;
      const data = snap.data() as ClassDoc;
      setClassDoc(data);
      void putCachedClass(data);
    });

    const attQuery = query(
      collection(db, 'attendance'),
      where('teacherUid', '==', user.uid),
      where('classId', '==', classId),
      where('sessionDate', '==', today)
    );

    const unsubAtt = onSnapshot(attQuery, (snap) => {
      if (!active) return;
      const records = snap.docs
        .map((d) => d.data() as Attendance)
        .sort((a, b) => b.scannedAt - a.scannedAt);
      setTodayAttendance(records);
      if (records.length > 0) {
        void putCachedAttendanceBatch(records);
      }
    });

    return () => {
      active = false;
      unsubClass();
      unsubAtt();
    };
  }, [user, classId, today]);

  // Real-time onSnapshot on students/{sid} for each student in roster (§7.4)
  useEffect(() => {
    if (!classDoc) return;
    const sids = classDoc.studentIds;
    if (sids.length === 0) return;

    let active = true;
    const unsubs: Array<() => void> = [];

    for (const sid of sids) {
      void getCachedStudent(sid).then((cached) => {
        if (active && cached) {
          setStudentMap((prev) => ({ ...prev, [sid]: cached }));
        }
      });

      const unsub = onSnapshot(doc(db, 'students', sid), (snap) => {
        if (!active || !snap.exists()) return;
        const st = snap.data() as Student;
        setStudentMap((prev) => ({ ...prev, [sid]: st }));
        void putCachedStudent(st);
      });
      unsubs.push(unsub);
    }

    return () => {
      active = false;
      for (const u of unsubs) u();
    };
  }, [classDoc?.studentIds.join(',')]);

  const buildDeps = useCallback((): ScanPipelineDeps => {
    return {
      isOnline: () => navigator.onLine,
      getCachedStudent: async (sid) => {
        return studentMap[sid] ?? (await getCachedStudent(sid));
      },
      putCachedStudent: async (student) => {
        setStudentMap((prev) => ({
          ...prev,
          [student.schoolStudentId]: student,
        }));
        await putCachedStudent(student);
      },
      registerFirstScan: callRegisterFirstScan,
      approveRotation: callApproveRotation,
      hasAttendanceForToday: async (cid, sessionDate, sid) => {
        if (seenTodayRef.current.has(sid)) return true;
        const cached = await getCachedAttendanceByClassAndDate(cid, sessionDate);
        return cached.some((r) => r.schoolStudentId === sid);
      },
      saveAttendance: async (record, docId) => {
        seenTodayRef.current.add(record.schoolStudentId);
        setTodayAttendance((prev) => [record, ...prev]);
        await putCachedAttendance(record);
        const write = setDoc(doc(db, 'attendance', docId), record);
        if (navigator.onLine) {
          await write;
        } else {
          void write.catch(() => {});
        }
      },
      classStudentIds: classDoc?.studentIds,
    };
  }, [studentMap, classDoc?.studentIds]);

  const applyOutcome = useCallback((outcome: ScanOutcome) => {
    if (outcome.status === 'RECORDED') {
      navigator.vibrate?.(50);
      setConfirmedCard({
        student: outcome.student,
        qr: outcome.qr,
        selfieWarning: outcome.selfieWarning,
        firstScan: outcome.firstScan,
      });
      setStatusBanner({
        type: outcome.selfieWarning ? 'warning' : 'success',
        message: outcome.firstScan
          ? `Added ${outcome.student.name} to class and recorded attendance.`
          : `Attendance recorded for ${outcome.student.name}.`,
      });
    } else if (outcome.status === 'DUPLICATE_IGNORED') {
      setConfirmedCard({
        student: outcome.student,
        qr: outcome.qr,
        selfieWarning: outcome.selfieWarning,
        firstScan: false,
        duplicate: true,
      });
      setStatusBanner({
        type: 'warning',
        message: `${outcome.student.name} is already marked present today (duplicate scan ignored).`,
      });
    } else if (outcome.status === 'ROTATION_NEEDED') {
      setRotationModal({
        qr: outcome.qr,
        storedStudent: outcome.storedStudent,
      });
    } else {
      setStatusBanner({
        type: 'danger',
        message: outcome.reason,
      });
    }
  }, []);

  const handleDecodedQr = useCallback(
    async (raw: string) => {
      if (!user || !classId) return;
      if (processingScanRef.current || rotationModal) return;

      const now = Date.now();
      if (
        lastDecodedRawRef.current &&
        lastDecodedRawRef.current.raw === raw &&
        now - lastDecodedRawRef.current.at < 3000
      ) {
        return;
      }
      lastDecodedRawRef.current = { raw, at: now };

      processingScanRef.current = true;
      try {
        const outcome = await processScannedQr(
          raw,
          { classId, teacherUid: user.uid },
          buildDeps()
        );
        applyOutcome(outcome);
      } finally {
        processingScanRef.current = false;
      }
    },
    [user, classId, rotationModal, buildDeps, applyOutcome]
  );

  // Initialize WASM QR decoder worker + rear camera loop
  useEffect(() => {
    const worker = new Worker(
      new URL('../../../workers/qr-decoder.worker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;

    let reqId = 0;
    let active = true;

    worker.onmessage = (
      event: MessageEvent<{ id: number; text: string | null }>
    ) => {
      busyDecodingRef.current = false;
      if (!active) return;
      if (event.data.text) {
        void handleDecodedQr(event.data.text);
      }
    };

    const startScanner = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera API unavailable. Upload a QR image to scan.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 1280 },
          },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraReady(true);
        }
      } catch {
        setCameraError(
          'Unable to access rear camera. Grant camera permissions or upload a QR image.'
        );
      }
    };

    void startScanner();

    const frameTimer = window.setInterval(() => {
      if (!active || busyDecodingRef.current || processingScanRef.current) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth) return;

      let canvas = canvasRef.current;
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvasRef.current = canvas;
      }

      const maxDim = 720;
      const scale = Math.min(
        1,
        maxDim / Math.max(video.videoWidth, video.videoHeight)
      );
      const w = Math.round(video.videoWidth * scale);
      const h = Math.round(video.videoHeight * scale);
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);

      busyDecodingRef.current = true;
      reqId += 1;
      worker.postMessage({ id: reqId, imageData }, [imageData.data.buffer]);
    }, 220);

    return () => {
      active = false;
      window.clearInterval(frameTimer);
      worker.terminate();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [handleDecodedQr]);

  const handleImageFileScan = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !workerRef.current) return;

    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    busyDecodingRef.current = true;
    workerRef.current.postMessage({ id: Date.now(), imageData }, [
      imageData.data.buffer,
    ]);
    e.target.value = '';
  };

  const handleApproveRotation = async () => {
    if (!rotationModal || !user || !classId) return;
    setRotationBusy(true);
    try {
      const outcome = await confirmKeyRotationAndRecord(
        rotationModal.qr,
        { classId, teacherUid: user.uid },
        buildDeps()
      );
      setRotationModal(null);
      applyOutcome(outcome);
    } finally {
      setRotationBusy(false);
    }
  };

  const handleRejectRotation = () => {
    setRotationModal(null);
    setStatusBanner({
      type: 'danger',
      message: 'Scan rejected — key mismatch.',
    });
  };

  return (
    <div className="stack-lg">
      <div className="row-between">
        <div className="row">
          <Link to="/teacher/classes" className="btn btn-sm">
            <ArrowLeft size={15} />
            Classes
          </Link>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.25rem' }}>
              {classDoc?.name ?? 'Scan Attendance'}
            </h1>
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              Session date: {today} · {todayAttendance.length} present
            </span>
          </div>
        </div>

        <label className="btn btn-sm" style={{ cursor: 'pointer' }}>
          <Upload size={14} />
          Scan Photo
          <input
            type="file"
            accept="image/*"
            onChange={handleImageFileScan}
            style={{ display: 'none' }}
          />
        </label>
      </div>

      {!isOnline && (
        <div className="alert alert-warning">
          Offline mode active: returning students verify and queue locally. First
          scans and key rotations require internet.
        </div>
      )}

      {statusBanner && (
        <div className={`alert alert-${statusBanner.type}`}>
          {statusBanner.message}
        </div>
      )}

      {confirmedCard && (
        <div
          className="card row"
          style={{
            borderColor: confirmedCard.selfieWarning
              ? 'var(--warning)'
              : 'var(--success)',
            borderWidth: 2,
          }}
        >
          <img
            src={selfieDataUrl(
              confirmedCard.qr.img || confirmedCard.student.selfieThumb
            )}
            alt={confirmedCard.student.name}
            className="avatar-lg"
          />
          <div className="stack-sm" style={{ flex: 1 }}>
            <div className="row" style={{ gap: '0.45rem' }}>
              <CheckCircle2
                size={22}
                color={
                  confirmedCard.selfieWarning
                    ? 'var(--warning)'
                    : 'var(--success)'
                }
              />
              <strong style={{ fontSize: '1.2rem' }}>
                {confirmedCard.student.name}
              </strong>
            </div>
            <div className="mono muted">
              ID: {confirmedCard.student.schoolStudentId}
            </div>
            <div className="mono muted" style={{ fontSize: '0.8rem' }}>
              Key FP: {confirmedCard.student.keyFingerprint}
              {confirmedCard.duplicate ? ' · Already recorded today' : ''}
            </div>
            {confirmedCard.selfieWarning && (
              <div className="alert alert-warning" style={{ padding: '0.45rem 0.7rem' }}>
                <AlertTriangle size={14} /> Selfie hash differs from stored record.
                Verify student&apos;s face visually.
              </div>
            )}
          </div>
        </div>
      )}

      <div className="card stack-sm">
        <div className="scanner-viewport">
          <video ref={videoRef} playsInline muted autoPlay />
          <div className="scanner-reticle" />
          {!cameraReady && !cameraError && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                gap: '0.5rem',
              }}
            >
              <Camera size={20} />
              Starting camera…
            </div>
          )}
        </div>
        {cameraError && (
          <div className="alert alert-warning">{cameraError}</div>
        )}
        <p className="muted" style={{ margin: 0, fontSize: '0.85rem', textAlign: 'center' }}>
          Point the camera at the student&apos;s live rotating QR code.
        </p>
      </div>

      <div className="card stack-sm">
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>
          Present Today ({todayAttendance.length})
        </h2>
        {todayAttendance.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No students scanned yet today.
          </p>
        ) : (
          <div className="stack-sm">
            {todayAttendance.map((att) => {
              const st = studentMap[att.schoolStudentId];
              return (
                <div
                  key={att.attendanceId}
                  className="row-between"
                  style={{
                    padding: '0.5rem 0.75rem',
                    borderRadius: 10,
                    background: 'var(--bg-muted)',
                  }}
                >
                  <div className="row">
                    {st?.selfieThumb && (
                      <img
                        src={selfieDataUrl(st.selfieThumb)}
                        alt={st.name}
                        className="avatar"
                        style={{ width: 38, height: 38 }}
                      />
                    )}
                    <div>
                      <div style={{ fontWeight: 600 }}>
                        {st?.name ?? att.schoolStudentId}
                      </div>
                      <div className="mono muted" style={{ fontSize: '0.78rem' }}>
                        {att.schoolStudentId}
                      </div>
                    </div>
                  </div>
                  <span className="muted" style={{ fontSize: '0.82rem' }}>
                    {new Date(att.scannedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {rotationModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card stack-md">
            <div className="row">
              <ShieldAlert size={24} color="var(--warning)" />
              <h2 style={{ margin: 0, fontSize: '1.15rem' }}>
                Key Rotation Approval
              </h2>
            </div>

            <p style={{ margin: 0 }}>
              This student&apos;s key has changed. Approve new key for{' '}
              <strong>{rotationModal.storedStudent.name}</strong> (
              <span className="mono">{rotationModal.qr.sid}</span>)?
            </p>

            <div className="grid-2" style={{ textAlign: 'center' }}>
              <div className="stack-sm" style={{ alignItems: 'center' }}>
                <span className="label">Stored Selfie</span>
                <img
                  src={selfieDataUrl(rotationModal.storedStudent.selfieThumb)}
                  alt="Stored student selfie"
                  className="avatar-lg"
                />
                <span className="mono muted" style={{ fontSize: '0.75rem' }}>
                  Old FP: {rotationModal.storedStudent.keyFingerprint}
                </span>
              </div>

              <div className="stack-sm" style={{ alignItems: 'center' }}>
                <span className="label">New QR Selfie</span>
                <img
                  src={selfieDataUrl(rotationModal.qr.img ?? '')}
                  alt="New QR selfie"
                  className="avatar-lg"
                />
                <span className="mono muted" style={{ fontSize: '0.75rem' }}>
                  New FP: {rotationModal.qr.fp}
                </span>
              </div>
            </div>

            <div className="row-between">
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleRejectRotation}
                disabled={rotationBusy}
              >
                Reject
              </button>
              <button
                type="button"
                className="btn btn-success"
                onClick={handleApproveRotation}
                disabled={rotationBusy}
              >
                {rotationBusy ? 'Approving…' : 'Approve New Key & Record'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
