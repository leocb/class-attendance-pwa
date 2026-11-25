import QRCode from 'qrcode';
import { CONFIG } from '../config';
import {
  buildCanonicalSignString,
  generateNonce,
  sha256Hex,
  signCanonicalString,
} from '../crypto';
import { getEstimatedServerNowSec } from '../time';
import type { QrPayload, StudentProfile } from '../../types';

export async function createSignedQrPayload(params: {
  profile: StudentProfile;
  privateKey: CryptoKey;
  includeSelfie?: boolean;
}): Promise<{ payload: QrPayload; serialized: string }> {
  const includeSelfie = params.includeSelfie ?? CONFIG.INCLUDE_SELFIE_IN_QR;
  const ts = await getEstimatedServerNowSec();
  const nce = generateNonce();
  const img = includeSelfie || params.profile.isRecovery ? params.profile.selfieThumb : undefined;
  const imgHash = await sha256Hex(img ?? '');

  const canonical = buildCanonicalSignString({
    sid: params.profile.schoolStudentId,
    n: params.profile.name,
    ts,
    nce,
    fp: params.profile.keyFingerprint,
    imgHash,
  });

  const sig = await signCanonicalString(params.privateKey, canonical);

  const payload: QrPayload = {
    v: 1,
    sid: params.profile.schoolStudentId,
    n: params.profile.name,
    ts,
    nce,
    fp: params.profile.keyFingerprint,
    sig,
    ...(img !== undefined ? { img } : {}),
    ...(params.profile.isRecovery ? { pk: params.profile.publicKeyJwk } : {}),
  };

  return {
    payload,
    serialized: JSON.stringify(payload),
  };
}

export async function renderQrToCanvas(
  canvas: HTMLCanvasElement,
  text: string
): Promise<void> {
  await QRCode.toCanvas(canvas, text, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 320,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });
}
