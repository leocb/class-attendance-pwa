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

describe('Student ECDSA P-256 Cryptography & Compact QR Payload', () => {
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

  it('signs canonical string with selfieHash (sh) and keeps QR payload compact', async () => {
    const keyPair = await generateStudentKeyPair();
    const jwk = await exportPublicKeyJwk(keyPair.publicKey);
    const fp = await computeFingerprintFromJwk(jwk);
    const sh = await sha256Hex(new Uint8Array([1, 2, 3, 4]));
    const ts = 1712345678;
    const nce = generateNonce();

    const canonical = buildCanonicalSignString({
      sid: 'A12345678',
      n: 'Jane Doe',
      ts,
      nce,
      fp,
      imgHash: sh,
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
      sh,
      sig,
    });
    expect(payloadJson.length).toBeLessThan(350);
    expect(parseQrPayload(payloadJson)).not.toBeNull();

    // Swapping selfieHash invalidates signature
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
