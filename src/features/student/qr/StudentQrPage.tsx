import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound, RefreshCw, UploadCloud } from 'lucide-react';
import { CONFIG } from '../../../lib/config';
import {
  getStudentPrivateKey,
  getStudentProfile,
  saveStudentProfile,
} from '../../../lib/idb';
import { ensureStudentAnonymousAuth } from '../../../lib/firebase/auth';
import { uploadStudentSelfie } from '../../../lib/firebase/storage';
import { errorMessage } from '../../../lib/errors';
import { createSignedQrPayload, renderQrToCanvas } from '../../../lib/qr';
import { useI18n } from '../../../lib/i18n';
import { useApp } from '../../../app/AppProvider';
import type { StudentProfile } from '../../../types';

export function StudentQrPage() {
  const navigate = useNavigate();
  const { isOnline } = useApp();
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
  const [remainingMs, setRemainingMs] = useState<number>(CONFIG.QR_REFRESH_MS);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number>(Date.now());
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [p, k] = await Promise.all([
        getStudentProfile(),
        getStudentPrivateKey(),
      ]);
      if (!active) return;
      if (!p || !k) {
        navigate('/student/register', { replace: true });
        return;
      }
      setProfile(p);
      setPrivateKey(k);
    })();
    return () => {
      active = false;
    };
  }, [navigate]);

  const syncPendingPhoto = useCallback(async () => {
    if (!profile || profile.selfieUploaded || !profile.selfieBytes || !navigator.onLine) {
      return;
    }
    setUploadingPhoto(true);
    try {
      const user = await ensureStudentAnonymousAuth();
      await uploadStudentSelfie({
        sid: profile.schoolStudentId,
        fp: profile.keyFingerprint,
        deviceUid: user.uid,
        bytes: profile.selfieBytes,
      });
      const updated: StudentProfile = {
        ...profile,
        deviceUid: user.uid,
        selfieUploaded: true,
        selfieBytes: undefined,
      };
      await saveStudentProfile(updated);
      setProfile(updated);
    } catch {
      // Keep pending until network/auth succeeds
    } finally {
      setUploadingPhoto(false);
    }
  }, [profile]);

  useEffect(() => {
    if (isOnline && profile && !profile.selfieUploaded) {
      void syncPendingPhoto();
    }
  }, [isOnline, profile, syncPendingPhoto]);

  const regenerateQr = useCallback(async () => {
    if (!profile || !privateKey || !canvasRef.current) return;
    try {
      const { serialized } = await createSignedQrPayload({
        profile,
        privateKey,
      });
      await renderQrToCanvas(canvasRef.current, serialized);
      setLastUpdatedAt(Date.now());
      setRemainingMs(CONFIG.QR_REFRESH_MS);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, t, 'errQrGenerate'));
    }
  }, [profile, privateKey, t]);

  useEffect(() => {
    if (!profile || !privateKey) return;
    void regenerateQr();
    const interval = window.setInterval(() => {
      void regenerateQr();
    }, CONFIG.QR_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [profile, privateKey, regenerateQr]);

  useEffect(() => {
    const tick = window.setInterval(() => {
      const elapsed = Date.now() - lastUpdatedAt;
      setRemainingMs(Math.max(0, CONFIG.QR_REFRESH_MS - elapsed));
    }, 250);
    return () => window.clearInterval(tick);
  }, [lastUpdatedAt]);

  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    const requestLock = async () => {
      try {
        if ('wakeLock' in navigator && document.visibilityState === 'visible') {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch {
        // WakeLock optional
      }
    };
    void requestLock();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void requestLock();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      void wakeLock?.release().catch(() => {});
    };
  }, []);

  if (!profile) {
    return (
      <div className="card">
        <p className="muted">{t('loadingStudentCreds')}</p>
      </div>
    );
  }

  const secondsLeft = Math.ceil(remainingMs / 1000);
  const progress = Math.max(0, Math.min(1, remainingMs / CONFIG.QR_REFRESH_MS));
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);

  return (
    <div className="card qr-fullscreen">
      {profile.isRecovery && (
        <div className="alert alert-warning" style={{ width: '100%', textAlign: 'left' }}>
          {t('recoveryQrBanner')}
        </div>
      )}

      {!profile.selfieUploaded && (
        <div
          className="alert alert-warning row-between"
          style={{ width: '100%', textAlign: 'left' }}
        >
          <span>{t('pendingUploadBanner')}</span>
          {isOnline && (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => void syncPendingPhoto()}
              disabled={uploadingPhoto}
            >
              <UploadCloud size={14} />
              {t('uploadNow')}
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="alert alert-danger" style={{ width: '100%' }}>
          {error}
        </div>
      )}

      <div className="qr-frame">
        <canvas
          ref={canvasRef}
          aria-label={t('qrAriaLabel')}
          style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
        />
      </div>

      <div className="row" style={{ justifyContent: 'center' }}>
        <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
          <circle
            cx="20"
            cy="20"
            r={radius}
            fill="none"
            stroke="var(--border)"
            strokeWidth="4"
          />
          <circle
            cx="20"
            cy="20"
            r={radius}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="4"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform="rotate(-90 20 20)"
          />
        </svg>
        <div style={{ textAlign: 'left' }}>
          <div className="row" style={{ gap: '0.4rem' }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: 'var(--success)',
                display: 'inline-block',
              }}
            />
            <strong>{t('live')}</strong>
            <span className="muted">
              · {t('refreshesIn', { seconds: secondsLeft })}
            </span>
          </div>
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'center' }}>
        <img
          src={profile.selfieDataUrl}
          alt={profile.name}
          className="avatar"
        />
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontWeight: 700, fontSize: '1.15rem' }}>{profile.name}</div>
          <div className="mono muted" style={{ fontSize: '0.9rem' }}>
            {t('idLabel')}: {profile.schoolStudentId}
          </div>
          <div className="mono muted" style={{ fontSize: '0.78rem' }}>
            {t('keyFp')}: {profile.keyFingerprint}
          </div>
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm" onClick={() => void regenerateQr()}>
          <RefreshCw size={14} />
          {t('refreshNow')}
        </button>
        <Link to="/student/recover" className="btn btn-sm">
          <KeyRound size={14} />
          {t('keyRecovery')}
        </Link>
      </div>

    </div>
  );
}
