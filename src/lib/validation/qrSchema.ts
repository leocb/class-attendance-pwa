import { z } from 'zod';
import { QR_PREFIX, decodeQrPayload } from '../qr/codec';

const ecPublicJwkSchema = z.object({
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

export type ValidatedQrPayload = z.infer<typeof qrPayloadSchema>;

export function parseQrPayload(raw: string): ValidatedQrPayload | null {
  try {
    const trimmed = raw.trim();
    // Packed format (current) or legacy JSON emitted by older clients.
    const parsed = trimmed.startsWith(QR_PREFIX)
      ? decodeQrPayload(trimmed)
      : JSON.parse(trimmed);
    if (!parsed) return null;
    const result = qrPayloadSchema.safeParse(parsed);
    if (!result.success) return null;
    return result.data;
  } catch {
    return null;
  }
}
