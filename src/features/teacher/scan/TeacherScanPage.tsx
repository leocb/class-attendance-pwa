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
  RefreshCw,
  ShieldAlert,
  User,
} from 'lucide-react';
import { useApp } from '../../../app/AppProvider';
import { db } from '../../../lib/firebase/client';
import {
  callApproveRotation,
  callGetRotationSelfie,
  callRegisterFirstScan,
} from '../../../lib/firebase/functions';
import { ensureStudentSelfieCached } from '../../../lib/firebase/storage';
import {
  getCachedAttendanceByClassAndDate,
  getCachedClass,
  getCachedSelfie,
  getCachedStudent,
  putCachedAttendance,
  putCachedAttendanceBatch,
  putCachedClass,
  putCachedSelfie,
  putCachedStudent,
  selfieCacheKey,
} from '../../../lib/idb';
import { useI18n } from '../../../lib/i18n';
import { openCameraStream } from '../../../lib/camera';
import { studentDocId } from '../../../lib/studentKey';
import { getLocalSessionDate } from '../../../lib/time';
import {
  SelfieZoomModal,
  type ZoomedSelfie,
} from '../../../components/SelfieZoomModal';
import type { Attendance, ClassDoc, QrPayload, Student } from '../../../types';
import {
  confirmKeyRotationAndRecord,
  processScannedQr,
  type ScanErrorCode,
  type ScanOutcome,
  type ScanPipelineDeps,
} from './scanPipeline';

interface RotationModalState {
  qr: QrPayload;
  storedStudent: Student;
  storedSelfieDataUrl: string | null;
  newSelfieDataUrl: string | null;
}

export function TeacherScanPage() {
  const { classId } = useParams<{ classId: string }>();
  const { user, isOnline } = useApp();
  const { t } = useI18n();

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
  const [selfieUrls, setSelfieUrls] = useState<Record<string, string>>({});
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'warning' | 'danger';
    message: string;
  } | null>(null);
  const [confirmedCard, setConfirmedCard] = useState<{
    student: Student;
    selfieDataUrl: string | null;
    selfieWarning: boolean;
    firstScan: boolean;
    duplicate?: boolean;
  } | null>(null);
  const [rotationModal, setRotationModal] =
    useState<RotationModalState | null>(null);
  const [rotationBusy, setRotationBusy] = useState(false);
  const [cameraRetry, setCameraRetry] = useState(0);
  const [zoomedSelfie, setZoomedSelfie] = useState<ZoomedSelfie | null>(null);

  const today = getLocalSessionDate();
  const seenTodayRef = useRef<Set<string>>(new Set());
  const seenNoncesRef = useRef<Map<string, number>>(new Map());

  const formatScanError = useCallback(
    (code: ScanErrorCode): string => {
      switch (code) {
        case 'MALFORMED_QR':
          return t('errMalformedQr');
        case 'FIRST_SCAN_OFFLINE':
          return t('errFirstScanOffline');
        case 'FIRST_SCAN_FAILED':
          return t('errFirstScanFailed');
        case 'ROTATION_OFFLINE':
          return t('errRotationOffline');
        case 'INVALID_SIGNATURE':
          return t('errInvalidSignature');
        case 'EXPIRED_QR':
          return t('errExpiredQr');
        case 'NAME_MISMATCH':
          return t('errNameMismatch');
        case 'SELFIE_HASH_MISMATCH':
          return t('errSelfieHashMismatch');
        case 'REPLAYED_NONCE':
          return t('errReplayedNonce');
        case 'ROTATION_FAILED':
          return t('errRotationFailed');
        case 'ROTATION_OLD_APP':
          return t('errRotationOldApp');
        case 'ROTATION_EXPIRED':
          return t('errRotationExpired');
        case 'ROTATION_REPLAYED':
          return t('errRotationReplayed');
        case 'ROTATION_NAME':
          return t('errRotationName');
        case 'ROTATION_SELFIE':
          return t('errRotationSelfie');
        case 'ROTATION_SIGNATURE':
          return t('errRotationSignature');
        case 'SELFIE_FETCH_FAILED':
          return t('errSelfieFetchFailed');
      }
    },
    [t]
  );

  useEffect(() => {
    const next = new Set<string>();
    for (const rec of todayAttendance) {
      next.add(rec.schoolStudentId);
    }
    seenTodayRef.current = next;
  }, [todayAttendance]);

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

  useEffect(() => {
    if (!user || !classDoc) return;
    const sids = classDoc.studentIds;
    if (sids.length === 0) return;

    let active = true;
    const unsubs: Array<() => void> = [];

    const cacheStudentAndSelfie = async (st: Student) => {
      if (!active) return;
      setStudentMap((prev) => ({ ...prev, [st.schoolStudentId]: st }));
      const url = await ensureStudentSelfieCached(st);
      if (active && url) {
        setSelfieUrls((prev) => ({ ...prev, [st.schoolStudentId]: url }));
      }
    };

    for (const sid of sids) {
      void getCachedStudent(sid).then((cached) => {
        if (cached) void cacheStudentAndSelfie(cached);
      });

      const unsub = onSnapshot(
        doc(db, 'students', studentDocId(user.uid, sid)),
        (snap) => {
          if (!active || !snap.exists()) return;
          const st = snap.data() as Student;
          void putCachedStudent(st);
          void cacheStudentAndSelfie(st);
        }
      );
      unsubs.push(unsub);
    }

    return () => {
      active = false;
      for (const u of unsubs) u();
    };
  }, [user, classDoc?.studentIds.join(',')]);

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
      ensureStudentSelfieCached: async (student) => {
        const mem = selfieUrls[student.schoolStudentId];
        if (mem) {
          const cached = await getCachedSelfie(
            student.schoolStudentId,
            student.keyFingerprint
          );
          if (cached && cached.selfieHash === student.selfieHash) {
            return mem;
          }
        }
        const url = await ensureStudentSelfieCached(student);
        if (url) {
          setSelfieUrls((prev) => ({
            ...prev,
            [student.schoolStudentId]: url,
          }));
        }
        return url;
      },
      cacheSelfieDataUrl: async (sid, fp, hash, dataUrl) => {
        setSelfieUrls((prev) => ({ ...prev, [sid]: dataUrl }));
        await putCachedSelfie({
          cacheKey: selfieCacheKey(sid, fp),
          schoolStudentId: sid,
          keyFingerprint: fp,
          selfieHash: hash,
          dataUrl,
          updatedAt: Date.now(),
        });
      },
      registerFirstScan: callRegisterFirstScan,
      getRotationSelfie: callGetRotationSelfie,
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
      hasAndMarkNonce: (sid, nce) => {
        const now = Date.now();
        // Prune nonces older than 4 minutes
        for (const [k, ts] of seenNoncesRef.current) {
          if (now - ts > 240_000) seenNoncesRef.current.delete(k);
        }
        const key = `${sid}__${nce}`;
        if (seenNoncesRef.current.has(key)) {
          return true;
        }
        seenNoncesRef.current.set(key, now);
        return false;
      },
    };
  }, [studentMap, selfieUrls, classDoc?.studentIds]);

  const applyOutcome = useCallback(
    (outcome: ScanOutcome) => {
      if (outcome.status === 'RECORDED') {
        navigator.vibrate?.(50);
        setConfirmedCard({
          student: outcome.student,
          selfieDataUrl: outcome.selfieDataUrl,
          selfieWarning: outcome.selfieWarning,
          firstScan: outcome.firstScan,
        });
        setStatusBanner({
          type: outcome.selfieWarning ? 'warning' : 'success',
          message: outcome.firstScan
            ? t('scanAddedAndRecorded', { name: outcome.student.name })
            : t('scanRecorded', { name: outcome.student.name }),
        });
      } else if (outcome.status === 'DUPLICATE_IGNORED') {
        setConfirmedCard({
          student: outcome.student,
          selfieDataUrl: outcome.selfieDataUrl,
          selfieWarning: outcome.selfieWarning,
          firstScan: false,
          duplicate: true,
        });
        setStatusBanner({
          type: 'warning',
          message: t('scanDuplicate', { name: outcome.student.name }),
        });
      } else if (outcome.status === 'ROTATION_NEEDED') {
        setRotationModal({
          qr: outcome.qr,
          storedStudent: outcome.storedStudent,
          storedSelfieDataUrl: outcome.storedSelfieDataUrl,
          newSelfieDataUrl: outcome.newSelfieDataUrl,
        });
      } else {
        setStatusBanner({
          type: 'danger',
          message: formatScanError(outcome.code),
        });
      }
    },
    [t, formatScanError]
  );

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

  // The camera effect must not restart when roster/attendance state changes,
  // so it reads the latest handler and translator through refs.
  const handleDecodedQrRef = useRef(handleDecodedQr);
  handleDecodedQrRef.current = handleDecodedQr;
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    const worker = new Worker(
      new URL('../../../workers/qr-decoder.worker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;

    let reqId = 0;
    let active = true;
    let lastPostAt = 0;
    busyDecodingRef.current = false;

    worker.onmessage = (
      event: MessageEvent<{ id: number; text: string | null }>
    ) => {
      busyDecodingRef.current = false;
      if (!active) return;
      if (event.data.text) {
        void handleDecodedQrRef.current(event.data.text);
      }
    };

    const startScanner = async () => {
      setCameraReady(false);
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(tRef.current('cameraScanErr'));
        return;
      }
      try {
        const stream = await openCameraStream('environment', 1920);
        if (!active) {
          stream.getTracks().forEach((tTrack) => tTrack.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          stream.getTracks().forEach((tTrack) => tTrack.stop());
          streamRef.current = null;
          return;
        }
        const markReady = () => {
          if (active) setCameraReady(true);
        };
        video.addEventListener('playing', markReady, { once: true });
        video.srcObject = stream;
        try {
          await video.play();
        } catch {
          // The muted inline video can finish starting on the next frame.
        }
        markReady();
      } catch {
        if (!active) return;
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((tTrack) => tTrack.stop());
          streamRef.current = null;
        }
        setCameraError(tRef.current('cameraScanErr'));
      }
    };

    void startScanner();

    const frameTimer = window.setInterval(() => {
      if (!active || processingScanRef.current) return;
      // Recover if a worker response never arrived (e.g. it was terminated
      // mid-decode): otherwise the scanner would silently stop forever.
      if (busyDecodingRef.current) {
        if (Date.now() - lastPostAt < 2500) return;
        busyDecodingRef.current = false;
      }
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth) return;

      let canvas = canvasRef.current;
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvasRef.current = canvas;
      }

      const maxDim = 1280;
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
      lastPostAt = Date.now();
      reqId += 1;
      worker.postMessage({ id: reqId, imageData }, [imageData.data.buffer]);
    }, 220);

    return () => {
      active = false;
      busyDecodingRef.current = false;
      window.clearInterval(frameTimer);
      worker.terminate();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((tTrack) => tTrack.stop());
        streamRef.current = null;
      }
    };
  }, [classId, cameraRetry]);

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
      message: t('scanRejectedMismatch'),
    });
  };

  return (
    <div className="stack-lg">
      <div className="row-between">
        <div className="row">
          <Link to="/teacher/classes" className="btn btn-sm">
            <ArrowLeft size={15} />
            {t('classes')}
          </Link>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.25rem' }}>
              {classDoc?.name ?? t('scanAttendanceTitle')}
            </h1>
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              {t('sessionDate')}: {today} · {todayAttendance.length}{' '}
              {t('presentCount')}
            </span>
          </div>
        </div>
      </div>

      {!isOnline && (
        <div className="alert alert-warning">{t('offlineScanBanner')}</div>
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
          {confirmedCard.selfieDataUrl ? (
            <button
              type="button"
              onClick={() =>
                setZoomedSelfie({
                  src: confirmedCard.selfieDataUrl!,
                  alt: confirmedCard.student.name,
                  caption: `${confirmedCard.student.name} (${confirmedCard.student.schoolStudentId})`,
                })
              }
              title={t('tapToZoom')}
              aria-label={`${confirmedCard.student.name} — ${t('tapToZoom')}`}
              style={{
                padding: 0,
                border: 'none',
                background: 'transparent',
                cursor: 'zoom-in',
                borderRadius: 16,
              }}
            >
              <img
                src={confirmedCard.selfieDataUrl}
                alt={confirmedCard.student.name}
                className="avatar-lg"
              />
            </button>
          ) : (
            <div
              className="avatar-lg"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <User size={40} />
            </div>
          )}
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
              {t('idLabel')}: {confirmedCard.student.schoolStudentId}
            </div>
            <div className="mono muted" style={{ fontSize: '0.8rem' }}>
              {t('keyFp')}: {confirmedCard.student.keyFingerprint}
              {confirmedCard.duplicate ? ` · ${t('alreadyRecordedToday')}` : ''}
            </div>
            {confirmedCard.selfieWarning && (
              <div className="alert alert-warning" style={{ padding: '0.45rem 0.7rem' }}>
                <AlertTriangle size={14} /> {t('selfieMismatchWarn')}
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
              {t('startingCamera')}
            </div>
          )}
        </div>
        {cameraError && (
          <div
            className="alert alert-warning row-between"
            style={{ flexWrap: 'wrap', gap: '0.5rem' }}
          >
            <span>{cameraError}</span>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setCameraError(null);
                setCameraReady(false);
                setCameraRetry((n) => n + 1);
              }}
            >
              <RefreshCw size={14} />
              {t('retryCamera')}
            </button>
          </div>
        )}
        <p className="muted" style={{ margin: 0, fontSize: '0.85rem', textAlign: 'center' }}>
          {t('scanInstruction')}
        </p>
      </div>

      <div className="card stack-sm">
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>
          {t('presentToday')} ({todayAttendance.length})
        </h2>
        {todayAttendance.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            {t('noStudentsScannedToday')}
          </p>
        ) : (
          <div className="stack-sm">
            {todayAttendance.map((att) => {
              const st = studentMap[att.schoolStudentId];
              const photo = selfieUrls[att.schoolStudentId];
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
                    {photo && (
                      <button
                        type="button"
                        onClick={() =>
                          setZoomedSelfie({
                            src: photo,
                            alt: st?.name ?? att.schoolStudentId,
                            caption: `${st?.name ?? att.schoolStudentId} (${att.schoolStudentId})`,
                          })
                        }
                        title={t('tapToZoom')}
                        aria-label={`${st?.name ?? att.schoolStudentId} — ${t('tapToZoom')}`}
                        style={{
                          padding: 0,
                          border: 'none',
                          background: 'transparent',
                          cursor: 'zoom-in',
                          borderRadius: 12,
                        }}
                      >
                        <img
                          src={photo}
                          alt={st?.name ?? att.schoolStudentId}
                          className="avatar"
                          style={{ width: 38, height: 38 }}
                        />
                      </button>
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
                {t('rotationTitle')}
              </h2>
            </div>

            <p style={{ margin: 0 }}>
              {t('rotationPrompt')}{' '}
              <strong>{rotationModal.storedStudent.name}</strong> (
              <span className="mono">{rotationModal.qr.sid}</span>)?
            </p>

            <div className="grid-2" style={{ textAlign: 'center' }}>
              <div className="stack-sm" style={{ alignItems: 'center' }}>
                <span className="label">{t('storedSelfie')}</span>
                {rotationModal.storedSelfieDataUrl ? (
                  <button
                    type="button"
                    onClick={() =>
                      setZoomedSelfie({
                        src: rotationModal.storedSelfieDataUrl!,
                        alt: t('storedSelfie'),
                        caption: `${rotationModal.storedStudent.name} — ${t('storedSelfie')}`,
                      })
                    }
                    title={t('tapToZoom')}
                    style={{
                      padding: 0,
                      border: 'none',
                      background: 'transparent',
                      cursor: 'zoom-in',
                      borderRadius: 16,
                    }}
                  >
                    <img
                      src={rotationModal.storedSelfieDataUrl}
                      alt={t('storedSelfieAlt')}
                      className="avatar-lg"
                    />
                  </button>
                ) : (
                  <div className="avatar-lg" />
                )}
              </div>

              <div className="stack-sm" style={{ alignItems: 'center' }}>
                <span className="label">{t('newQrSelfie')}</span>
                <span className="muted" style={{ fontSize: '0.85rem' }}>
                  {rotationModal.qr.n}
                </span>
                {rotationModal.newSelfieDataUrl ? (
                  <button
                    type="button"
                    onClick={() =>
                      setZoomedSelfie({
                        src: rotationModal.newSelfieDataUrl!,
                        alt: t('newQrSelfie'),
                        caption: `${rotationModal.storedStudent.name} — ${t('newQrSelfie')}`,
                      })
                    }
                    title={t('tapToZoom')}
                    style={{
                      padding: 0,
                      border: 'none',
                      background: 'transparent',
                      cursor: 'zoom-in',
                      borderRadius: 16,
                    }}
                  >
                    <img
                      src={rotationModal.newSelfieDataUrl}
                      alt={t('newSelfieAlt')}
                      className="avatar-lg"
                    />
                  </button>
                ) : (
                  <div className="avatar-lg" />
                )}
              </div>
            </div>

            <div className="row-between">
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleRejectRotation}
                disabled={rotationBusy}
              >
                {t('reject')}
              </button>
              <button
                type="button"
                className="btn btn-success"
                onClick={handleApproveRotation}
                disabled={rotationBusy}
              >
                {rotationBusy ? t('approving') : t('approveAndRecord')}
              </button>
            </div>
          </div>
        </div>
      )}

      <SelfieZoomModal
        image={zoomedSelfie}
        onClose={() => setZoomedSelfie(null)}
      />
    </div>
  );
}
