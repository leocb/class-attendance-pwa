import QRCode from 'qrcode';
import { buildCanonicalSignString, generateNonce, signCanonicalString } from '../crypto';
import { encodeQrPayload } from './codec';
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
    // Always carry the public key (unsigned, verified against fp server-side).
    // Without it, a device whose key changed but was not registered through the
    // recovery flow could never complete a scan-time rotation.
    pk: params.profile.publicKeyJwk,
  };

  return {
    payload,
    serialized: encodeQrPayload(payload),
  };
}

export async function renderQrToCanvas(
  canvas: HTMLCanvasElement,
  text: string
): Promise<void> {
  await QRCode.toCanvas(canvas, text, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 360,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });
}
