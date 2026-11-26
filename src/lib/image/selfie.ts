import { CONFIG } from '../config';
import { LocalizedError } from '../errors';
import { sha256Hex } from '../crypto';

export interface EncodedSelfie {
  bytes: Uint8Array;
  blob: Blob;
  dataUrl: string;
  mimeType: 'image/webp';
  byteLength: number;
  sha256Hex: string;
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
    throw new LocalizedError('errSelfieEncode');
  }

  const side = Math.min(srcWidth, srcHeight);
  const sx = Math.floor((srcWidth - side) / 2);
  const sy = Math.floor((srcHeight - side) / 2);
  ctx.drawImage(source, sx, sy, side, side, 0, 0, size, size);
  return canvas;
}

function canvasToWebpBlob(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new LocalizedError('errSelfieEncode'));
        }
      },
      'image/webp',
      quality
    );
  });
}

export function bytesToWebpDataUrl(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:image/webp;base64,${btoa(binary)}`;
}

async function encodeCanvasWebP(canvas: HTMLCanvasElement): Promise<EncodedSelfie> {
  const qualitySteps = [CONFIG.SELFIE_WEBP_QUALITY, 0.72, 0.6, 0.45, 0.3];
  let blob = await canvasToWebpBlob(canvas, qualitySteps[0]);

  for (let i = 1; i < qualitySteps.length && blob.size > CONFIG.SELFIE_MAX_BYTES; i++) {
    blob = await canvasToWebpBlob(canvas, qualitySteps[i]);
  }

  if (blob.size > CONFIG.SELFIE_MAX_BYTES) {
    throw new LocalizedError('errSelfieTooLarge');
  }

  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const hash = await sha256Hex(bytes);

  return {
    bytes,
    blob,
    dataUrl: bytesToWebpDataUrl(bytes),
    mimeType: 'image/webp',
    byteLength: bytes.byteLength,
    sha256Hex: hash,
  };
}

export async function captureSelfieFromVideo(
  video: HTMLVideoElement
): Promise<EncodedSelfie> {
  const width = video.videoWidth || CONFIG.SELFIE_SIZE_PX;
  const height = video.videoHeight || CONFIG.SELFIE_SIZE_PX;
  const canvas = drawCenterCroppedSquare(video, width, height, CONFIG.SELFIE_SIZE_PX);
  return encodeCanvasWebP(canvas);
}

export async function encodeSelfieFromFile(file: File | Blob): Promise<EncodedSelfie> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new LocalizedError('selfieDecodeError'));
      el.src = url;
    });
    const canvas = drawCenterCroppedSquare(
      img,
      img.naturalWidth,
      img.naturalHeight,
      CONFIG.SELFIE_SIZE_PX
    );
    return encodeCanvasWebP(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}
