import { describe, expect, it, vi } from 'vitest';
import worker, { type WorkerEnv } from '../../worker/index';

describe('Cloudflare Worker static assets & Firebase proxy', () => {
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

  it('returns 503 when proxy env vars are unset and proxies /time & /api/passkey/* when set', async () => {
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
      );

    const configuredEnv: WorkerEnv = {
      ...emptyEnv,
      FIREBASE_FUNCTIONS_BASE_URL:
        'https://us-central1-demo-project.cloudfunctions.net',
    };

    const timeRes = await worker.fetch(
      new Request('https://alunos.leobottaro.com/time'),
      configuredEnv
    );
    expect(timeRes.status).toBe(200);
    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      'https://us-central1-demo-project.cloudfunctions.net/getServerTime',
      expect.objectContaining({ method: 'GET' })
    );

    const passkeyRes = await worker.fetch(
      new Request('https://alunos.leobottaro.com/api/passkey/register/options', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://alunos.leobottaro.com',
        },
        body: JSON.stringify({ displayName: 'Prof. Leo' }),
      }),
      configuredEnv
    );
    expect(passkeyRes.status).toBe(200);
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      'https://us-central1-demo-project.cloudfunctions.net/passkeyAuth/api/passkey/register/options',
      expect.objectContaining({ method: 'POST' })
    );

    fetchSpy.mockRestore();
  });
});
