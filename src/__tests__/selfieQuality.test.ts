import { describe, expect, it } from 'vitest';
import { analyzeLuminance, isBlankSelfie } from '../lib/image/quality';

function solid(r: number, g: number, b: number, size = 64): Uint8ClampedArray {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return data;
}

function textured(size = 64): Uint8ClampedArray {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const v = (x * 4 + y * 3) % 256;
      data[i] = v;
      data[i + 1] = (v * 2) % 256;
      data[i + 2] = (v * 3) % 256;
      data[i + 3] = 255;
    }
  }
  return data;
}

describe('selfie blank-frame detection', () => {
  it('rejects an all-black frame', () => {
    expect(isBlankSelfie(analyzeLuminance(solid(0, 0, 0), 64, 64))).toBe(true);
  });

  it('rejects an all-white frame', () => {
    expect(
      isBlankSelfie(analyzeLuminance(solid(255, 255, 255), 64, 64))
    ).toBe(true);
  });

  it('rejects an empty buffer (camera produced no frame)', () => {
    expect(isBlankSelfie(analyzeLuminance(new Uint8ClampedArray(0), 0, 0))).toBe(
      true
    );
  });

  it('accepts a textured frame', () => {
    expect(isBlankSelfie(analyzeLuminance(textured(), 64, 64))).toBe(false);
  });
});
