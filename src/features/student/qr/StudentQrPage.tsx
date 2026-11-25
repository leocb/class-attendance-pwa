import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound, RefreshCw } from 'lucide-react';
import { CONFIG } from '../../../lib/config';
import { getStudentPrivateKey, getStudentProfile } from '../../../lib/idb';
import { createSignedQrPayload, renderQrToCanvas } from '../../../lib/qr';
import { selfieDataUrl } from '../../../lib/image/selfie';
import type { StudentProfile } from '../../../types';

export function StudentQrPage() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
  const [remainingMs, setRemainingMs] = useState(CONFIG.QR_REFRESH_MS);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number>(Date.now());
  const [payloadSize, setPayloadSize] = useState<number>(0);
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

  const regenerateQr = useCallback(async () => {
    if (!profile || !privateKey || !canvasRef.current) return;
    try {
      const { serialized } = await createSignedQrPayload({
        profile,
        privateKey,
      });
      await renderQrToCanvas(canvasRef.current, serialized);
      setPayloadSize(serialized.length);
      setLastUpdatedAt(Date.now());
      setRemainingMs(CONFIG.QR_REFRESH_MS);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate QR');
    }
  }, [profile, privateKey]);

  // 30-second rotating QR interval (§6.2)
  useEffect(() => {
    if (!profile || !privateKey) return;
    void regenerateQr();
    const interval = window.setInterval(() => {
      void regenerateQr();
    }, CONFIG.QR_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [profile, privateKey, regenerateQr]);

  // Progress countdown ticker
  useEffect(() => {
    const tick = window.setInterval(() => {
      const elapsed = Date.now() - lastUpdatedAt;
      setRemainingMs(Math.max(0, CONFIG.QR_REFRESH_MS - elapsed));
    }, 250);
    return () => window.clearInterval(tick);
  }, [lastUpdatedAt]);

  // Screen WakeLock while displaying QR (§6.2)
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    const requestLock = async () => {
      try {
        if ('wakeLock' in navigator && document.visibilityState === 'visible') {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch {
        // WakeLock optional on unsupported browsers
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
        <p className="muted">Loading student credentials…</p>
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
          <strong>Recovery QR Active:</strong> Show this QR to your teacher so
          they can approve your new key during the scan.
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
          aria-label="Live signed student attendance QR code"
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
            <strong>Live</strong>
            <span className="muted">· refreshes in {secondsLeft}s</span>
          </div>
          <div className="muted" style={{ fontSize: '0.78rem' }}>
            {payloadSize} bytes signed ECDSA P-256
          </div>
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'center' }}>
        <img
          src={selfieDataUrl(profile.selfieThumb)}
          alt={profile.name}
          className="avatar"
        />
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontWeight: 700, fontSize: '1.15rem' }}>{profile.name}</div>
          <div className="mono muted" style={{ fontSize: '0.9rem' }}>
            ID: {profile.schoolStudentId}
          </div>
          <div className="mono muted" style={{ fontSize: '0.78rem' }}>
            Key FP: {profile.keyFingerprint}
          </div>
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm" onClick={() => void regenerateQr()}>
          <RefreshCw size={14} />
          Refresh Now
        </button>
        <Link to="/student/recover" className="btn btn-sm">
          <KeyRound size={14} />
          Key Recovery
        </Link>
      </div>
    </div>
  );
}
