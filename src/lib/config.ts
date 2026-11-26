/** True when the app is served from a local development host. */
function isLocalDevHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

/**
 * Local development skips the client-side bot check: the production Turnstile
 * sitekey is not valid for localhost, and the server still verifies any token
 * in real deployments, so this never weakens production.
 */
export const IS_LOCAL_DEV = isLocalDevHost();

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '';

export const CONFIG = {
  /** QR rotation interval in milliseconds. */
  QR_REFRESH_MS: 30_000,

  /** Maximum allowed clock/screenshot age in seconds. */
  QR_MAX_AGE_SECONDS: 180,

  /** Time offset refresh interval while online. */
  TIME_SYNC_INTERVAL_MS: 10 * 60 * 1000,

  /** Selfie square size in pixels (512x512 WebP HD). */
  SELFIE_SIZE_PX: 512,

  /** Initial WebP encoding quality for crisp facial verification. */
  SELFIE_WEBP_QUALITY: 0.82,

  /** Maximum allowed selfie file size in bytes (1 MB). */
  SELFIE_MAX_BYTES: 1024 * 1024,

  /** Cloudflare Turnstile public sitekey. */
  TURNSTILE_SITE_KEY,

  /** Whether the Turnstile challenge should be required on this host. */
  TURNSTILE_ENABLED: Boolean(TURNSTILE_SITE_KEY) && !IS_LOCAL_DEV,

  /** Base URL for Cloud Functions HTTP endpoints (empty = same origin / Worker proxy). */
  FUNCTIONS_BASE_URL: (import.meta.env.VITE_FUNCTIONS_BASE_URL ?? '').replace(/\/$/, ''),
} as const;
