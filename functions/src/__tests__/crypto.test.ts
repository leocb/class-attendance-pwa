import { describe, expect, it } from 'vitest';
import {
  buildCanonicalSignString,
  computeFingerprintFromJwk,
  isTimestampFresh,
  qrPayloadSchema,
  sha256Hex,
  verifyQrSignature,
} from '../crypto';
import { webcrypto } from 'node:crypto';

describe('Cloud Functions ECDSA P-256 interoperability with WebCrypto', () => {
  it('verifies a browser WebCrypto ECDSA signature and SPKI fingerprint in Node crypto', async () => {
    const subtle = webcrypto.subtle;
    const keyPair = await subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign', 'verify']
    );

    const jwk = (await subtle.exportKey('jwk', keyPair.publicKey)) as {
      kty: 'EC';
      crv: 'P-256';
      x: string;
      y: string;
    };
    const fp = computeFingerprintFromJwk(jwk);
    expect(fp).toMatch(/^[A-Z2-7]{8}$/);

    const img = 'UklGRh4AAABXRUJQ';
    const ts = Math.floor(Date.now() / 1000);
    const nce = 'a1b2c3d4';
    const canonical = buildCanonicalSignString({
      sid: 'A12345678',
      n: 'Jane Doe',
      ts,
      nce,
      fp,
      img,
    });
    expect(canonical).toBe(
      `v1|A12345678|Jane Doe|${ts}|${nce}|${fp}|${sha256Hex(img)}`
    );

    const rawSig = await subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      keyPair.privateKey,
      new TextEncoder().encode(canonical)
    );
    const sig = Buffer.from(rawSig).toString('base64url');

    const parsed = qrPayloadSchema.parse({
      v: 1,
      sid: 'A12345678',
      n: 'Jane Doe',
      ts,
      nce,
      fp,
      sig,
      img,
    });

    expect(verifyQrSignature(jwk, parsed)).toBe(true);
    expect(
      verifyQrSignature(jwk, { ...parsed, n: 'Tampered Name' })
    ).toBe(false);
  });

  it('enforces 180s timestamp freshness', () => {
    const nowMs = 1712345800_000;
    expect(isTimestampFresh(1712345800 - 180, nowMs)).toBe(true);
    expect(isTimestampFresh(1712345800 - 181, nowMs)).toBe(false);
  });
});
