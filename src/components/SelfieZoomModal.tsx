import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '../lib/i18n';

export interface ZoomedSelfie {
  src: string;
  alt: string;
  caption?: string;
}

interface SelfieZoomModalProps {
  image: ZoomedSelfie | null;
  onClose: () => void;
}

export function SelfieZoomModal({ image, onClose }: SelfieZoomModalProps) {
  const { t } = useI18n();

  useEffect(() => {
    if (!image) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [image, onClose]);

  if (!image) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={image.alt}
      style={{ zIndex: 80, background: 'rgba(2, 6, 23, 0.92)' }}
      onClick={onClose}
    >
      <div
        className="stack-md"
        style={{
          alignItems: 'center',
          maxWidth: '94vw',
          maxHeight: '94dvh',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="btn btn-sm"
          onClick={onClose}
          aria-label={t('closeZoom')}
          style={{
            alignSelf: 'flex-end',
            borderRadius: 999,
            padding: '0.45rem 0.65rem',
          }}
        >
          <X size={18} />
        </button>

        <img
          src={image.src}
          alt={image.alt}
          onClick={onClose}
          style={{
            width: 'min(90vw, 76dvh, 560px)',
            height: 'min(90vw, 76dvh, 560px)',
            objectFit: 'contain',
            borderRadius: 20,
            background: '#0f172a',
            boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
            cursor: 'zoom-out',
          }}
        />

        {(image.caption || image.alt) && (
          <div
            style={{
              color: '#f8fafc',
              fontWeight: 600,
              fontSize: '1.05rem',
              textAlign: 'center',
            }}
          >
            {image.caption ?? image.alt}
          </div>
        )}
      </div>
    </div>
  );
}
