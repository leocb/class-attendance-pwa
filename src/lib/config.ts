export const CONFIG = {
  /** Include base64 selfie thumbnail inside QR payload (§5.4). */
  INCLUDE_SELFIE_IN_QR:
    import.meta.env.VITE_INCLUDE_SELFIE_IN_QR !== 'false',

  /** Optional experimental JPEG XL encoding behind flag (§5.4). Default: false (WebP). */
  USE_JXL: import.meta.env.VITE_USE_JXL === 'true',

  /** QR rotation interval in milliseconds (§5.2). */
  QR_REFRESH_MS: 30_000,

  /** Maximum allowed clock/screenshot age in seconds (§5.3). */
  QR_MAX_AGE_SECONDS: 180,

  /** Time offset refresh interval while online (§6.4). */
  TIME_SYNC_INTERVAL_MS: 10 * 60 * 1000,

  /** Selfie square size in pixels (§5.4). */
  SELFIE_SIZE_PX: 96,

  /** WebP encoding quality (§5.4). */
  SELFIE_WEBP_QUALITY: 0.4,

  /** Base URL for Cloud Functions HTTP endpoints (empty = same origin / Hosting rewrite). */
  FUNCTIONS_BASE_URL: (import.meta.env.VITE_FUNCTIONS_BASE_URL ?? '').replace(/\/$/, ''),
} as const;
