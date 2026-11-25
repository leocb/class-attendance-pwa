import { CONFIG } from '../config';
import { getServerOffset, saveServerOffset } from '../idb';
import type { ServerOffsetRecord } from '../../types';

let memoryOffset: ServerOffsetRecord | null = null;

export async function loadServerOffset(): Promise<ServerOffsetRecord> {
  if (memoryOffset) return memoryOffset;
  const stored = await getServerOffset();
  if (stored) {
    memoryOffset = stored;
    return stored;
  }
  return { serverOffset: 0, offsetSyncedAt: 0 };
}

export async function syncServerOffset(): Promise<ServerOffsetRecord | null> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return null;
  }

  try {
    const endpoint = `${CONFIG.FUNCTIONS_BASE_URL}/time`;
    const before = Date.now();
    const res = await fetch(endpoint, { method: 'GET', cache: 'no-store' });
    if (!res.ok) return null;
    const after = Date.now();
    const data = (await res.json()) as { now?: number };
    if (typeof data.now !== 'number') return null;

    // Midpoint RTT compensation for more accurate clock offset
    const deviceMidpoint = Math.round((before + after) / 2);
    const record: ServerOffsetRecord = {
      serverOffset: data.now - deviceMidpoint,
      offsetSyncedAt: after,
    };
    memoryOffset = record;
    await saveServerOffset(record);
    return record;
  } catch {
    return null;
  }
}

export async function getEstimatedServerNowMs(): Promise<number> {
  const { serverOffset } = await loadServerOffset();
  return Date.now() + serverOffset;
}

export async function getEstimatedServerNowSec(): Promise<number> {
  const ms = await getEstimatedServerNowMs();
  return Math.floor(ms / 1000);
}

export function isTimestampFresh(
  qrTsSec: number,
  estimatedNowSec: number,
  maxAgeSec: number = CONFIG.QR_MAX_AGE_SECONDS
): boolean {
  return Math.abs(estimatedNowSec - qrTsSec) <= maxAgeSec;
}

export function getLocalSessionDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
