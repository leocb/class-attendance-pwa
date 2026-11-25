import { CONFIG } from '../config';

export interface EncodedSelfie {
  base64: string;
  mimeType: 'image/webp' | 'image/jxl';
  byteLength: number;
}

function drawCenterCroppedSquare(
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number,
  size: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not acquire 2D canvas context');
  }

  const side = Math.min(srcWidth, srcHeight);
  const sx = Math.floor((srcWidth - side) / 2);
  const sy = Math.floor((srcHeight - side) / 2);
  ctx.drawImage(source, sx, sy, side, side, 0, 0, size, size);
  return canvas;
}

function dataUrlToBase64(dataUrl: string): string {
  const idx = dataUrl.indexOf(',');
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

async function encodeCanvasWebP(canvas: HTMLCanvasElement): Promise<EncodedSelfie> {
  let quality: number = CONFIG.SELFIE_WEBP_QUALITY;
  let dataUrl = canvas.toDataURL('image/webp', quality);

  // Fallback check if browser returned PNG instead of WebP
  if (!dataUrl.startsWith('data:image/webp')) {
    dataUrl = canvas.toDataURL('image/jpeg', 0.45);
  }

  let base64 = dataUrlToBase64(dataUrl);
  // Keep thumbnail under 900 bytes where possible (§4)
  while (base64.length > 1200 && quality > 0.15) {
    quality = Math.max(0.15, quality - 0.08);
    dataUrl = canvas.toDataURL('image/webp', quality);
    base64 = dataUrlToBase64(dataUrl);
  }

  const byteLength = Math.floor((base64.length * 3) / 4);
  return {
    base64,
    mimeType: 'image/webp',
    byteLength,
  };
}

async function encodeCanvas(canvas: HTMLCanvasElement): Promise<EncodedSelfie> {
  if (CONFIG.USE_JXL) {
    // Experimental JXL path behind USE_JXL flag (§5.4); falls back cleanly to WebP.
    try {
      const jxlUrl = canvas.toDataURL('image/jxl', 0.4);
      if (jxlUrl.startsWith('data:image/jxl')) {
        const base64 = dataUrlToBase64(jxlUrl);
        return {
          base64,
          mimeType: 'image/jxl',
          byteLength: Math.floor((base64.length * 3) / 4),
        };
      }
    } catch {
      // Fallback to WebP
    }
  }
  return encodeCanvasWebP(canvas);
}

export async function captureSelfieFromVideo(
  video: HTMLVideoElement
): Promise<EncodedSelfie> {
  const width = video.videoWidth || 320;
  const height = video.videoHeight || 320;
  const canvas = drawCenterCroppedSquare(video, width, height, CONFIG.SELFIE_SIZE_PX);
  return encodeCanvas(canvas);
}

export async function encodeSelfieFromFile(file: File | Blob): Promise<EncodedSelfie> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Failed to decode selected image'));
      el.src = url;
    });
    const canvas = drawCenterCroppedSquare(
      img,
      img.naturalWidth,
      img.naturalHeight,
      CONFIG.SELFIE_SIZE_PX
    );
    return encodeCanvas(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function selfieDataUrl(base64: string): string {
  if (!base64) return '';
  if (base64.startsWith('data:')) return base64;
  return `data:image/webp;base64,${base64}`;
}
