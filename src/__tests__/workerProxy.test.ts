import { describe, expect, it, vi } from 'vitest';
import worker, { type WorkerEnv } from '../../worker/index';

describe('Cloudflare Worker static assets, security gates & Firebase proxy', () => {
  it('sets no-cache headers on /sw.js and application/wasm on .wasm assets', async () => {
    const env: WorkerEnv = {
      ASSETS: {
        fetch: vi.fn(async (req) => {
          const path = new URL(
            typeof req === 'string' ? req : req instanceof URL ? req.href : req.url
          ).pathname;
          return new Response(`asset:${path}`, { status: 200 });
        }),
      },
    };

    const swRes = await worker.fetch(
      new Request('https://alunos.leobottaro.com/sw.js'),
      env
    );
    expect(swRes.headers.get('Cache-Control')).toBe(
      'no-cache, no-store, must-revalidate'
    );

    const wasmRes = await worker.fetch(
      new Request('https://alunos.leobottaro.com/zxing_reader.wasm'),
      env
    );
    expect(wasmRes.headers.get('Content-Type')).toBe('application/wasm');
  });

  it('rejects unknown passkey subpaths and disallowed HTTP methods at the edge', async () => {
    const env: WorkerEnv = {
      ASSETS: { fetch: vi.fn(async () => new Response('ok')) },
      FIREBASE_FUNCTIONS_BASE_URL:
        'https://southamerica-east1-classroom-attendance-a03af.cloudfunctions.net',
    };

    const badPath = await worker.fetch(
      new Request('https://alunos.leobottaro.com/api/passkey/admin', {
        method: 'POST',
      }),
      env
    );
    expect(badPath.status).toBe(404);

    const badMethodPasskey = await worker.fetch(
      new Request('https://alunos.leobottaro.com/api/passkey/login/options', {
        method: 'GET',
      }),
      env
    );
    expect(badMethodPasskey.status).toBe(405);

    const badMethodTime = await worker.fetch(
      new Request('https://alunos.leobottaro.com/time', { method: 'POST' }),
      env
    );
    expect(badMethodTime.status).toBe(405);
  });

  it('proxies /time, /api/passkey/*, and /api/turnstile/verify cleanly when configured', async () => {
    const emptyEnv: WorkerEnv = {
      ASSETS: { fetch: vi.fn(async () => new Response('ok')) },
    };

    const missingRes = await worker.fetch(
      new Request('https://alunos.leobottaro.com/time'),
      emptyEnv
    );
    expect(missingRes.status).toBe(503);

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ now: 1712345678000 }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ challengeId: 'c1' }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      );

    const configuredEnv: WorkerEnv = {
      ...emptyEnv,
      FIREBASE_FUNCTIONS_BASE_URL:
        'https://southamerica-east1-demo-project.cloudfunctions.net',
    };

    const timeRes = await worker.fetch(
      new Request('https://alunos.leobottaro.com/time'),
      configuredEnv
    );
    expect(timeRes.status).toBe(200);
    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      'https://southamerica-east1-demo-project.cloudfunctions.net/getServerTime',
      expect.objectContaining({ method: 'GET' })
    );

    const passkeyRes = await worker.fetch(
      new Request('https://alunos.leobottaro.com/api/passkey/register/options', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://alunos.leobottaro.com',
          'X-Secret-Test': 'should-not-forward',
        },
        body: JSON.stringify({ displayName: 'Prof. Leo' }),
      }),
      configuredEnv
    );
    expect(passkeyRes.status).toBe(200);
    const forwardedHeaders = fetchSpy.mock.calls[1][1]?.headers as Headers;
    expect(forwardedHeaders.get('x-secret-test')).toBeNull();
    expect(forwardedHeaders.get('origin')).toBe('https://alunos.leobottaro.com');

    const turnstileRes = await worker.fetch(
      new Request('https://alunos.leobottaro.com/api/turnstile/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnstileToken: 'tok', action: 'student_register' }),
      }),
      configuredEnv
    );
    expect(turnstileRes.status).toBe(200);
    expect(fetchSpy).toHaveBeenNthCalledWith(
      3,
      'https://southamerica-east1-demo-project.cloudfunctions.net/verifyTurnstile',
      expect.objectContaining({ method: 'POST' })
    );

    fetchSpy.mockRestore();
  });
});
