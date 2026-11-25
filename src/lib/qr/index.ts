import QRCode from 'qrcode';
import { buildCanonicalSignString, generateNonce, signCanonicalString } from '../crypto';
import { getEstimatedServerNowSec } from '../time';
import type { QrPayload, StudentProfile } from '../../types';

export async function createSignedQrPayload(params: {
  profile: StudentProfile;
  privateKey: CryptoKey;
}): Promise<{ payload: QrPayload; serialized: string }> {
  const ts = await getEstimatedServerNowSec();
  const nce = generateNonce();
  const sh = params.profile.selfieHash;

  const canonical = buildCanonicalSignString({
    sid: params.profile.schoolStudentId,
    n: params.profile.name,
    ts,
    nce,
    fp: params.profile.keyFingerprint,
    imgHash: sh,
  });

  const sig = await signCanonicalString(params.privateKey, canonical);

  const payload: QrPayload = {
    v: 1,
    sid: params.profile.schoolStudentId,
    n: params.profile.name,
    ts,
    nce,
    fp: params.profile.keyFingerprint,
    sh,
    sig,
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
    width: 300,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });
}
