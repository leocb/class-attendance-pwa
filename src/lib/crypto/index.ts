const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

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

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Bytes(data: string | Uint8Array): Promise<Uint8Array> {
  const input = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const copy = new Uint8Array(input.byteLength);
  copy.set(input);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return new Uint8Array(digest);
}

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  return bytesToHex(await sha256Bytes(data));
}

export async function generateStudentKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, // non-extractable private key (§5.1)
    ['sign', 'verify']
  );
}

export async function exportSpkiBytes(publicKey: CryptoKey): Promise<Uint8Array> {
  const spki = await crypto.subtle.exportKey('spki', publicKey);
  return new Uint8Array(spki);
}

export async function exportPublicKeyJwk(publicKey: CryptoKey): Promise<JsonWebKey> {
  const jwk = await crypto.subtle.exportKey('jwk', publicKey);
  return {
    kty: jwk.kty,
    crv: jwk.crv,
    x: jwk.x,
    y: jwk.y,
    ext: true,
    key_ops: ['verify'],
  };
}

export async function importVerifyKeyFromJwk(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    {
      kty: jwk.kty,
      crv: jwk.crv,
      x: jwk.x,
      y: jwk.y,
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['verify']
  );
}

export async function computeFingerprintFromSpki(spkiBytes: Uint8Array): Promise<string> {
  const hash = await sha256Bytes(spkiBytes);
  return base32Encode(hash).slice(0, 8);
}

export async function computeFingerprintFromJwk(jwk: JsonWebKey): Promise<string> {
  const key = await importVerifyKeyFromJwk(jwk);
  const spki = await exportSpkiBytes(key);
  return computeFingerprintFromSpki(spki);
}

export function buildCanonicalSignString(params: {
  sid: string;
  n: string;
  ts: number;
  nce: string;
  fp: string;
  imgHash: string;
}): string {
  return `v1|${params.sid}|${params.n}|${params.ts}|${params.nce}|${params.fp}|${params.imgHash}`;
}

export async function signCanonicalString(
  privateKey: CryptoKey,
  canonical: string
): Promise<string> {
  const data = new TextEncoder().encode(canonical);
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    data
  );
  return bytesToBase64Url(new Uint8Array(sig));
}

export async function verifyCanonicalSignature(
  publicKeyJwk: JsonWebKey,
  canonical: string,
  sigBase64Url: string
): Promise<boolean> {
  try {
    const key = await importVerifyKeyFromJwk(publicKeyJwk);
    const sigBytes = base64UrlToBytes(sigBase64Url);
    const sigCopy = new Uint8Array(sigBytes.byteLength);
    sigCopy.set(sigBytes);
    const data = new TextEncoder().encode(canonical);
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      sigCopy.buffer,
      data
    );
  } catch {
    return false;
  }
}

export function generateNonce(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}
