export interface LuminanceStats {
  mean: number;
  stdDev: number;
  samples: number;
}

/**
 * Samples the RGBA buffer and returns luminance statistics. Used to reject
 * selfies that are effectively empty (all black/white or a flat frame), which
 * would otherwise be signed into a student key.
 */
export function analyzeLuminance(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  step = 4
): LuminanceStats {
  let sum = 0;
  let sumSquares = 0;
  let samples = 0;
  const stride = Math.max(1, Math.floor(step));

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const index = (y * width + x) * 4;
      const luminance =
        0.2126 * data[index] +
        0.7152 * data[index + 1] +
        0.0722 * data[index + 2];
      sum += luminance;
      sumSquares += luminance * luminance;
      samples += 1;
    }
  }

  if (samples === 0) {
    return { mean: 0, stdDev: 0, samples: 0 };
  }

  const mean = sum / samples;
  const variance = Math.max(0, sumSquares / samples - mean * mean);
  return { mean, stdDev: Math.sqrt(variance), samples };
}

/**
 * Rejects blank/near-uniform frames: fully black or white images, a camera
 * that has not produced frames yet, or a lens covered by a finger.
 */
export function isBlankSelfie(stats: LuminanceStats): boolean {
  if (stats.samples === 0) return true;
  if (stats.stdDev < 6) return true;
  if (stats.mean < 15) return true;
  if (stats.mean > 240) return true;
  return false;
}
