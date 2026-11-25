import { describe, expect, it } from 'vitest';
import {
  buildCanonicalSignString,
  computeFingerprintFromJwk,
  computeFingerprintFromSpki,
  exportPublicKeyJwk,
  exportSpkiBytes,
  generateNonce,
  generateStudentKeyPair,
  sha256Hex,
  signCanonicalString,
  verifyCanonicalSignature,
} from '../lib/crypto';
import { parseQrPayload } from '../lib/validation/qrSchema';
import { isTimestampFresh } from '../lib/time';

describe('Student ECDSA P-256 Cryptography & QR Payload', () => {
  it('generates a non-extractable private key and deterministic 8-char Base32 fingerprint', async () => {
    const keyPair = await generateStudentKeyPair();
    expect(keyPair.privateKey.extractable).toBe(false);

    await expect(
      crypto.subtle.exportKey('jwk', keyPair.privateKey)
    ).rejects.toThrow();

    const spki = await exportSpkiBytes(keyPair.publicKey);
    const jwk = await exportPublicKeyJwk(keyPair.publicKey);
    const fpFromSpki = await computeFingerprintFromSpki(spki);
    const fpFromJwk = await computeFingerprintFromJwk(jwk);

    expect(fpFromSpki).toMatch(/^[A-Z2-7]{8}$/);
    expect(fpFromJwk).toBe(fpFromSpki);
  });

  it('signs canonical string and detects tampering on any field including selfie img', async () => {
    const keyPair = await generateStudentKeyPair();
    const jwk = await exportPublicKeyJwk(keyPair.publicKey);
    const fp = await computeFingerprintFromJwk(jwk);
    const img = 'UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=';
    const imgHash = await sha256Hex(img);
    const ts = 1712345678;
    const nce = generateNonce();

    const canonical = buildCanonicalSignString({
      sid: 'A12345678',
      n: 'Jane Doe',
      ts,
      nce,
      fp,
      imgHash,
    });
    const sig = await signCanonicalString(keyPair.privateKey, canonical);

    expect(await verifyCanonicalSignature(jwk, canonical, sig)).toBe(true);

    const payloadJson = JSON.stringify({
      v: 1,
      sid: 'A12345678',
      n: 'Jane Doe',
      ts,
      nce,
      fp,
      sig,
      img,
    });
    expect(parseQrPayload(payloadJson)).not.toBeNull();

    // Swapping selfie image invalidates signature
    const tamperedCanonical = buildCanonicalSignString({
      sid: 'A12345678',
      n: 'Jane Doe',
      ts,
      nce,
      fp,
      imgHash: await sha256Hex('tampered_selfie'),
    });
    expect(await verifyCanonicalSignature(jwk, tamperedCanonical, sig)).toBe(
      false
    );
  });

  it('validates 180s freshness window and rejects malformed QR JSON', () => {
    const serverNowSec = 1712345800;
    expect(isTimestampFresh(serverNowSec, serverNowSec)).toBe(true);
    expect(isTimestampFresh(serverNowSec - 180, serverNowSec)).toBe(true);
    expect(isTimestampFresh(serverNowSec - 181, serverNowSec)).toBe(false);
    expect(isTimestampFresh(serverNowSec + 181, serverNowSec)).toBe(false);

    // Simulated 2-hour clock drift corrected by offset
    const deviceClockSec = serverNowSec - 7200;
    const offsetSec = 7200;
    const correctedTs = deviceClockSec + offsetSec;
    expect(isTimestampFresh(correctedTs, serverNowSec)).toBe(true);

    expect(parseQrPayload('not-json')).toBeNull();
    expect(parseQrPayload(JSON.stringify({ v: 2, sid: '123' }))).toBeNull();
  });
});
