import crypto from 'node:crypto';
import { z } from 'zod';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const QR_MAX_AGE_SECONDS = 180;

export const ecPublicJwkSchema = z.object({
  kty: z.literal('EC'),
  crv: z.literal('P-256'),
  x: z.string().min(1),
  y: z.string().min(1),
  ext: z.boolean().optional(),
  key_ops: z.array(z.string()).optional(),
});

export const qrPayloadSchema = z.object({
  v: z.literal(1),
  sid: z.string().trim().min(1).max(64),
  n: z.string().trim().min(1).max(120),
  ts: z.number().int().positive(),
  nce: z.string().min(4).max(64),
  fp: z.string().length(8),
  sh: z.string().regex(/^[0-9a-f]{64}$/),
  sig: z.string().min(16).max(256),
  pk: ecPublicJwkSchema.optional(),
});

export type QrPayload = z.infer<typeof qrPayloadSchema>;
export type EcPublicJwk = z.infer<typeof ecPublicJwkSchema>;

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function sha256Hex(input: string | Uint8Array): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function computeFingerprintFromJwk(jwk: EcPublicJwk): string {
  const keyObj = crypto.createPublicKey({
    key: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
    format: 'jwk',
  });
  const spki = keyObj.export({ type: 'spki', format: 'der' });
  const digest = crypto.createHash('sha256').update(spki).digest();
  return base32Encode(digest).slice(0, 8);
}

export function buildCanonicalSignString(qr: {
  sid: string;
  n: string;
  ts: number;
  nce: string;
  fp: string;
  sh: string;
}): string {
  return `v1|${qr.sid}|${qr.n}|${qr.ts}|${qr.nce}|${qr.fp}|${qr.sh}`;
}

export function verifyQrSignature(
  publicKeyJwk: EcPublicJwk,
  qr: QrPayload
): boolean {
  try {
    const canonical = buildCanonicalSignString(qr);
    const keyObj = crypto.createPublicKey({
      key: {
        kty: publicKeyJwk.kty,
        crv: publicKeyJwk.crv,
        x: publicKeyJwk.x,
        y: publicKeyJwk.y,
      },
      format: 'jwk',
    });
    const sigBytes = Buffer.from(qr.sig, 'base64url');
    return crypto.verify(
      'sha256',
      Buffer.from(canonical, 'utf8'),
      { key: keyObj, dsaEncoding: 'ieee-p1363' },
      sigBytes
    );
  } catch {
    return false;
  }
}

export function isTimestampFresh(
  qrTsSec: number,
  serverNowMs: number = Date.now(),
  maxAgeSec: number = QR_MAX_AGE_SECONDS
): boolean {
  const serverNowSec = Math.floor(serverNowMs / 1000);
  return Math.abs(serverNowSec - qrTsSec) <= maxAgeSec;
}
