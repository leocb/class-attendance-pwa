export interface WorkerAssetsBinding {
  fetch(input: Request | URL | string, init?: RequestInit): Promise<Response>;
}

export interface WorkerEnv {
  ASSETS: WorkerAssetsBinding;
  FIREBASE_FUNCTIONS_BASE_URL?: string;
  GET_SERVER_TIME_URL?: string;
  PASSKEY_AUTH_URL?: string;
  VERIFY_TURNSTILE_URL?: string;
}

const ALLOWED_PASSKEY_SUBPATHS = new Set([
  '/register/options',
  '/register/verify',
  '/login/options',
  '/login/verify',
]);

const FORWARDED_HEADER_ALLOWLIST = [
  'content-type',
  'origin',
  'user-agent',
  'cf-connecting-ip',
  'x-forwarded-for',
];

function resolveFunctionUrl(
  explicitUrl: string | undefined,
  baseUrl: string | undefined,
  functionName: string
): string | null {
  const trimmedExplicit = explicitUrl?.trim();
  if (trimmedExplicit) {
    return trimmedExplicit.replace(/\/$/, '');
  }
  const trimmedBase = baseUrl?.trim();
  if (trimmedBase) {
    return `${trimmedBase.replace(/\/$/, '')}/${functionName}`;
  }
  return null;
}

async function proxyToFirebase(
  request: Request,
  targetUrl: string
): Promise<Response> {
  const headers = new Headers();
  for (const name of FORWARDED_HEADER_ALLOWLIST) {
    const val = request.headers.get(name);
    if (val) headers.set(name, val);
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  const upstream = await fetch(targetUrl, init);
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.set('Cache-Control', 'no-store');

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const { pathname, search } = url;

    // 1. Proxy server time endpoint (GET only) -> Firebase getServerTime
    if (pathname === '/time' || pathname === '/api/time') {
      if (request.method !== 'GET') {
        return Response.json({ error: 'Method not allowed' }, { status: 405 });
      }
      const target = resolveFunctionUrl(
        env.GET_SERVER_TIME_URL,
        env.FIREBASE_FUNCTIONS_BASE_URL,
        'getServerTime'
      );
      if (!target) {
        return Response.json(
          {
            error:
              'Cloudflare Worker missing FIREBASE_FUNCTIONS_BASE_URL or GET_SERVER_TIME_URL.',
          },
          { status: 503 }
        );
      }
      return proxyToFirebase(request, `${target}${search}`);
    }

    // 2. Proxy WebAuthn passkey endpoints (POST + exact allowlisted subpaths only)
    if (pathname.startsWith('/api/passkey')) {
      const subpath = pathname.replace(/^\/api\/passkey/, '');
      if (!ALLOWED_PASSKEY_SUBPATHS.has(subpath)) {
        return Response.json({ error: 'Not found' }, { status: 404 });
      }
      if (request.method !== 'POST') {
        return Response.json({ error: 'Method not allowed' }, { status: 405 });
      }
      const targetBase = resolveFunctionUrl(
        env.PASSKEY_AUTH_URL,
        env.FIREBASE_FUNCTIONS_BASE_URL,
        'passkeyAuth'
      );
      if (!targetBase) {
        return Response.json(
          {
            error:
              'Cloudflare Worker missing FIREBASE_FUNCTIONS_BASE_URL or PASSKEY_AUTH_URL.',
          },
          { status: 503 }
        );
      }
      return proxyToFirebase(request, `${targetBase}/api/passkey${subpath}`);
    }

    // 3. Proxy Turnstile verification endpoint for online student flows (POST only)
    if (pathname === '/api/turnstile/verify') {
      if (request.method !== 'POST') {
        return Response.json({ error: 'Method not allowed' }, { status: 405 });
      }
      const target = resolveFunctionUrl(
        env.VERIFY_TURNSTILE_URL,
        env.FIREBASE_FUNCTIONS_BASE_URL,
        'verifyTurnstile'
      );
      if (!target) {
        return Response.json(
          {
            error:
              'Cloudflare Worker missing FIREBASE_FUNCTIONS_BASE_URL or VERIFY_TURNSTILE_URL.',
          },
          { status: 503 }
        );
      }
      return proxyToFirebase(request, target);
    }

    // 4. Serve static assets with PWA-safe cache/MIME headers
    const assetResponse = await env.ASSETS.fetch(request);
    const headers = new Headers(assetResponse.headers);

    if (pathname === '/sw.js') {
      headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (pathname.endsWith('.wasm')) {
      headers.set('Content-Type', 'application/wasm');
    }

    return new Response(assetResponse.body, {
      status: assetResponse.status,
      statusText: assetResponse.statusText,
      headers,
    });
  },
};
