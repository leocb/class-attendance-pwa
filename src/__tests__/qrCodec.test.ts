import { describe, expect, it } from 'vitest';
import { decodeQrPayload, encodeQrPayload } from '../lib/qr/codec';
import { parseQrPayload } from '../lib/validation/qrSchema';
import { bytesToBase64Url } from '../lib/crypto';
import type { QrPayload } from '../types';

const payload: QrPayload = {
  v: 1,
  sid: '123456',
  n: 'Leo Teste',
  ts: 1795659318,
  nce: '96239920',
  fp: 'OEAJRDTZ',
  sh: 'a'.repeat(64),
  sig: bytesToBase64Url(new Uint8Array(64).fill(1)),
  pk: {
    kty: 'EC',
    crv: 'P-256',
    x: bytesToBase64Url(new Uint8Array(32).fill(2)),
    y: bytesToBase64Url(new Uint8Array(32).fill(3)),
  },
};

describe('compact QR codec', () => {
  it('round-trips a payload through the packed format', () => {
    const encoded = encodeQrPayload(payload);
    expect(encoded.startsWith('q2:')).toBe(true);
    expect(decodeQrPayload(encoded)).toEqual(payload);
    expect(parseQrPayload(encoded)).toEqual(payload);
  });

  it('is smaller than the legacy JSON encoding', () => {
    expect(encodeQrPayload(payload).length).toBeLessThan(
      JSON.stringify(payload).length
    );
  });

  it('still parses legacy JSON payloads', () => {
    expect(parseQrPayload(JSON.stringify(payload))).toEqual(payload);
  });

  it('supports payloads without a public key', () => {
    const { pk: _pk, ...withoutPk } = payload;
    expect(decodeQrPayload(encodeQrPayload(withoutPk))).toEqual(withoutPk);
  });

  it('rejects malformed payloads', () => {
    expect(decodeQrPayload('q2:not-base64')).toBeNull();
    expect(parseQrPayload('q2:AAAA')).toBeNull();
    expect(parseQrPayload('{"v":1}')).toBeNull();
  });
});
