import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Camera, RefreshCw, Upload } from 'lucide-react';
import {
  captureSelfieFromVideo,
  encodeSelfieFromFile,
  selfieDataUrl,
  type EncodedSelfie,
} from '../lib/image/selfie';

interface SelfieCaptureProps {
  value: EncodedSelfie | null;
  onChange: (selfie: EncodedSelfie | null) => void;
}

export function SelfieCapture({ value, onChange }: SelfieCaptureProps) {
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
      setCameraError('Camera API unavailable. Please upload a photo instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } },
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
      setCameraError(
        'Could not access front camera. Check permissions or upload a photo.'
      );
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
        err instanceof Error ? err.message : 'Failed to capture selfie.'
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
        err instanceof Error ? err.message : 'Failed to process photo.'
      );
    }
  };

  return (
    <div className="stack-sm">
      <span className="label">Live Selfie Thumbnail (96×96 WebP)</span>

      {value ? (
        <div className="row" style={{ alignItems: 'center' }}>
          <img
            src={selfieDataUrl(value.base64)}
            alt="Captured student selfie"
            className="avatar-lg"
          />
          <div className="stack-sm">
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              Encoded ({value.byteLength} bytes, {value.mimeType})
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
              Retake Selfie
            </button>
          </div>
        </div>
      ) : cameraActive ? (
        <div className="stack-sm">
          <div className="scanner-viewport" style={{ maxWidth: 280 }}>
            <video ref={videoRef} autoPlay playsInline muted />
          </div>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={handleSnap}>
              <Camera size={16} />
              Capture Photo
            </button>
            <button type="button" className="btn" onClick={stopCamera}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={startCamera}>
            <Camera size={16} />
            Open Front Camera
          </button>
          <label className="btn" style={{ cursor: 'pointer' }}>
            <Upload size={16} />
            Take / Upload Photo
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
