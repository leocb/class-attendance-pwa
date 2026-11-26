import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Camera, RefreshCw, Upload } from 'lucide-react';
import {
  captureSelfieFromVideo,
  encodeSelfieFromFile,
  type EncodedSelfie,
} from '../lib/image/selfie';
import { errorMessage } from '../lib/errors';
import { useI18n } from '../lib/i18n';

interface SelfieCaptureProps {
  value: EncodedSelfie | null;
  onChange: (selfie: EncodedSelfie | null) => void;
}

export function SelfieCapture({ value, onChange }: SelfieCaptureProps) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const startCamera = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(t('cameraUnavailable'));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      });
    } catch {
      setCameraError(t('cameraAccessError'));
    }
  };

  const handleSnap = async () => {
    if (!videoRef.current) return;
    try {
      const encoded = await captureSelfieFromVideo(videoRef.current);
      onChange(encoded);
      stopCamera();
    } catch (err) {
      setCameraError(
        errorMessage(err, t, 'selfieProcessError')
      );
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCameraError(null);
    try {
      const encoded = await encodeSelfieFromFile(file);
      onChange(encoded);
      stopCamera();
    } catch (err) {
      setCameraError(
        errorMessage(err, t, 'selfieDecodeError')
      );
    }
  };

  return (
    <div className="stack-sm">
      <span className="label">{t('selfieLabel')}</span>

      {value ? (
        <div className="row" style={{ alignItems: 'center' }}>
          <img
            src={value.dataUrl}
            alt={t('capturedSelfieAlt')}
            className="avatar-lg"
          />
          <div className="stack-sm">
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              {t('encodedSummary')} ({(value.byteLength / 1024).toFixed(1)} KB,{' '}
              {value.mimeType})
            </span>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                onChange(null);
                void startCamera();
              }}
            >
              <RefreshCw size={14} />
              {t('retakeSelfie')}
            </button>
          </div>
        </div>
      ) : cameraActive ? (
        <div className="stack-sm">
          <div className="scanner-viewport" style={{ maxWidth: 280 }}>
            {/* Preview only mirrors the front camera; the saved selfie stays unmirrored. */}
            <video ref={videoRef} autoPlay playsInline muted className="selfie-mirror" />
            <svg
              className="selfie-face-guide"
              viewBox="0 0 100 100"
              aria-hidden="true"
              focusable="false"
            >
              <ellipse
                className="face-guide-stroke"
                cx="50"
                cy="42"
                rx="21"
                ry="27"
              />
              <path
                className="face-guide-stroke"
                d="M22 88c3-12 13-19 28-19s25 7 28 19"
              />
            </svg>
          </div>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={handleSnap}>
              <Camera size={16} />
              {t('capturePhoto')}
            </button>
            <button type="button" className="btn" onClick={stopCamera}>
              {t('cancel')}
            </button>
          </div>
        </div>
      ) : (
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={startCamera}>
            <Camera size={16} />
            {t('openFrontCamera')}
          </button>
          <label className="btn" style={{ cursor: 'pointer' }}>
            <Upload size={16} />
            {t('uploadPhoto')}
            <input
              type="file"
              accept="image/*"
              capture="user"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      )}

      {cameraError && <div className="alert alert-warning">{cameraError}</div>}
    </div>
  );
}
