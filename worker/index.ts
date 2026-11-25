export interface WorkerAssetsBinding {
  fetch(input: Request | URL | string, init?: RequestInit): Promise<Response>;
}

export interface WorkerEnv {
  ASSETS: WorkerAssetsBinding;
  FIREBASE_FUNCTIONS_BASE_URL?: string;
  GET_SERVER_TIME_URL?: string;
  PASSKEY_AUTH_URL?: string;
}

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
  const headers = new Headers(request.headers);
  headers.delete('host');

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

    // 1. Proxy server time endpoint -> Firebase getServerTime
    if (pathname === '/time' || pathname === '/api/time') {
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

    // 2. Proxy WebAuthn passkey endpoints -> Firebase passkeyAuth
    if (pathname.startsWith('/api/passkey')) {
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
      const subpath = pathname.replace(/^\/api\/passkey/, '');
      return proxyToFirebase(request, `${targetBase}/api/passkey${subpath}${search}`);
    }

    // 3. Serve static assets with PWA-safe cache/MIME headers
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
