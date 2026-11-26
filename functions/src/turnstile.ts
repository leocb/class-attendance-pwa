import { onRequest } from 'firebase-functions/v2/https';

export interface VerifyTurnstileParams {
  token: unknown;
  /** Accepted action value(s); teacher flows share a single `teacher_auth` action. */
  expectedAction: string | string[];
  remoteIp?: string;
}

export function getExpectedTurnstileHostnames(): Set<string> {
  const configured = (process.env.TURNSTILE_HOSTNAMES ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);

  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    return new Set([...configured, 'localhost', '127.0.0.1']);
  }

  return new Set(configured);
}

export async function verifyTurnstileToken({
  token,
  expectedAction,
  remoteIp,
}: VerifyTurnstileParams): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET?.trim();
  const expectedHostnames = getExpectedTurnstileHostnames();

  if (
    !secret ||
    typeof token !== 'string' ||
    token.length === 0 ||
    token.length > 2048 ||
    expectedHostnames.size === 0
  ) {
    return false;
  }

  const form = new URLSearchParams({
    secret,
    response: token,
  });
  if (remoteIp) {
    form.set('remoteip', remoteIp);
  }

  let result: {
    success?: boolean;
    action?: string;
    hostname?: string;
  };
  try {
    const r = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: AbortSignal.timeout(10_000),
        body: form,
      }
    );
    if (!r.ok) return false;
    result = (await r.json()) as {
      success?: boolean;
      action?: string;
      hostname?: string;
    };
  } catch {
    return false;
  }

  const acceptedActions = Array.isArray(expectedAction)
    ? expectedAction
    : [expectedAction];

  return (
    result.success === true &&
    typeof result.action === 'string' &&
    acceptedActions.includes(result.action) &&
    typeof result.hostname === 'string' &&
    expectedHostnames.has(result.hostname)
  );
}

const allowedCorsOrigins = (
  process.env.WEBAUTHN_ORIGIN || 'https://alunos.leobottaro.com'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const verifyTurnstile = onRequest(
  { cors: allowedCorsOrigins },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const token = req.body?.['cf-turnstile-response'] ?? req.body?.turnstileToken;
    const action = req.body?.action;
    if (action !== 'student_register' && action !== 'student_recover') {
      res.status(400).json({ error: 'Invalid verification action.' });
      return;
    }

    const remoteIp =
      (typeof req.headers['cf-connecting-ip'] === 'string' &&
        req.headers['cf-connecting-ip']) ||
      req.ip;

    const ok = await verifyTurnstileToken({
      token,
      expectedAction: action,
      remoteIp,
    });

    if (!ok) {
      res.status(403).json({ error: 'Bot verification failed.' });
      return;
    }

    res.status(200).json({ ok: true });
  }
);
