import { base64UrlToBytes, bytesToBase64Url, bytesToHex } from '../crypto';
import type { QrPayload } from '../../types';

/**
 * Compact QR wire format: `q2:` + base64url of a packed binary payload.
 *
 * The JSON form is ~390 bytes; packing the fields (raw signature, 32-byte
 * hashes/coordinates instead of hex/base64 text) yields ~195 bytes, which at
 * base64url is ~260 chars instead of ~390. Fewer modules for the same physical
 * QR size, so the code stays readable. Cryptographic fields are incompressible,
 * so gzip would only add its header/trailer bytes.
 */
export const QR_PREFIX = 'q2:';
const WIRE_VERSION = 2;
const FP_BYTES = 8;

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function encodeQrPayload(payload: QrPayload): string {
  const encoder = new TextEncoder();
  const parts: number[] = [WIRE_VERSION, payload.pk ? 1 : 0];

  const pushBlock = (bytes: Uint8Array) => {
    if (bytes.length > 255) throw new Error('QR block too large');
    parts.push(bytes.length);
    for (const byte of bytes) parts.push(byte);
  };

  pushBlock(encoder.encode(payload.sid));
  pushBlock(encoder.encode(payload.n));
  pushBlock(encoder.encode(payload.nce));

  parts.push(
    (payload.ts >>> 24) & 0xff,
    (payload.ts >>> 16) & 0xff,
    (payload.ts >>> 8) & 0xff,
    payload.ts & 0xff
  );

  const fp = encoder.encode(payload.fp);
  if (fp.length !== FP_BYTES) throw new Error('Invalid key fingerprint length');
  for (const byte of fp) parts.push(byte);

  pushBlock(hexToBytes(payload.sh));
  pushBlock(base64UrlToBytes(payload.sig));

  if (payload.pk) {
    pushBlock(base64UrlToBytes(payload.pk.x ?? ''));
    pushBlock(base64UrlToBytes(payload.pk.y ?? ''));
  }

  return QR_PREFIX + bytesToBase64Url(Uint8Array.from(parts));
}

export function decodeQrPayload(raw: string): QrPayload | null {
  if (!raw.startsWith(QR_PREFIX)) return null;

  try {
    const bytes = base64UrlToBytes(raw.slice(QR_PREFIX.length));
    let offset = 0;

    const readByte = (): number => {
      if (offset >= bytes.length) throw new Error('Truncated payload');
      return bytes[offset++];
    };
    const readBlock = (): Uint8Array => {
      const length = readByte();
      if (offset + length > bytes.length) throw new Error('Truncated block');
      const block = bytes.subarray(offset, offset + length);
      offset += length;
      return block;
    };

    if (readByte() !== WIRE_VERSION) return null;
    const hasPublicKey = readByte() === 1;

    const decoder = new TextDecoder();
    const sid = decoder.decode(readBlock());
    const name = decoder.decode(readBlock());
    const nce = decoder.decode(readBlock());

    if (offset + 4 > bytes.length) return null;
    const ts =
      ((bytes[offset] << 24) >>> 0) +
      (bytes[offset + 1] << 16) +
      (bytes[offset + 2] << 8) +
      bytes[offset + 3];
    offset += 4;

    if (offset + FP_BYTES > bytes.length) return null;
    const fp = decoder.decode(bytes.subarray(offset, offset + FP_BYTES));
    offset += FP_BYTES;

    const sh = bytesToHex(readBlock());
    const sig = bytesToBase64Url(readBlock());

    let pk: JsonWebKey | undefined;
    if (hasPublicKey) {
      const x = bytesToBase64Url(readBlock());
      const y = bytesToBase64Url(readBlock());
      pk = { kty: 'EC', crv: 'P-256', x, y };
    }

    return { v: 1, sid, n: name, ts, nce, fp, sh, sig, ...(pk ? { pk } : {}) };
  } catch {
    return null;
  }
}
