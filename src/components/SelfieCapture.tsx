import { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw } from 'lucide-react';
import {
  captureSelfieFromVideo,
  type EncodedSelfie,
} from '../lib/image/selfie';
import { errorMessage } from '../lib/errors';
import { openCameraStream } from '../lib/camera';
import { useI18n } from '../lib/i18n';

interface SelfieCaptureProps {
  value: EncodedSelfie | null;
  onChange: (selfie: EncodedSelfie | null) => void;
}

export function SelfieCapture({ value, onChange }: SelfieCaptureProps) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(false);
  const startingRef = useRef(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Attach the stream only after React has rendered the <video> element.
  useEffect(() => {
    if (!cameraActive) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
    void video.play().catch(() => {
      // Autoplay can be deferred by the browser; the muted inline video
      // usually starts on the next frame.
    });
  }, [cameraActive]);

  const startCamera = async () => {
    if (startingRef.current || streamRef.current) return;
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(t('cameraUnavailable'));
      return;
    }
    startingRef.current = true;
    try {
      const stream = await openCameraStream('user', 720);
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      setCameraActive(true);
    } catch {
      if (mountedRef.current) setCameraError(t('cameraAccessError'));
    } finally {
      startingRef.current = false;
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
              {t('encodedSummary')} ({(value.byteLength / 1024).toFixed(1)} KB)
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
                cy="45"
                rx="34"
                ry="40"
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
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={startCamera}>
            <Camera size={16} />
            {t('openFrontCamera')}
          </button>
        </div>
      )}

      {cameraError && <div className="alert alert-warning">{cameraError}</div>}
    </div>
  );
}
