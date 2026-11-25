import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyTurnstileToken } from '../turnstile';

describe('Cloudflare Turnstile Siteverify', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.TURNSTILE_SECRET;
    delete process.env.TURNSTILE_HOSTNAMES;
    delete process.env.FUNCTIONS_EMULATOR;
  });

  it('fails closed on missing/malformed tokens or missing env config', async () => {
    expect(
      await verifyTurnstileToken({ token: '', expectedAction: 'teacher_login' })
    ).toBe(false);

    process.env.TURNSTILE_SECRET = 'dummy-secret';
    process.env.TURNSTILE_HOSTNAMES = 'alunos.leobottaro.com';

    expect(
      await verifyTurnstileToken({
        token: 'a'.repeat(2049),
        expectedAction: 'teacher_login',
      })
    ).toBe(false);
  });

  it('validates success, action, and production hostname strictly', async () => {
    process.env.TURNSTILE_SECRET = 'dummy-secret';
    process.env.TURNSTILE_HOSTNAMES = 'alunos.leobottaro.com';

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            action: 'teacher_register',
            hostname: 'alunos.leobottaro.com',
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            action: 'teacher_login', // mismatched action
            hostname: 'alunos.leobottaro.com',
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            action: 'teacher_register',
            hostname: 'localhost', // rejected in production
          }),
          { status: 200 }
        )
      );

    expect(
      await verifyTurnstileToken({
        token: 'valid-tok',
        expectedAction: 'teacher_register',
        remoteIp: '203.0.113.10',
      })
    ).toBe(true);

    expect(
      await verifyTurnstileToken({
        token: 'wrong-action',
        expectedAction: 'teacher_register',
      })
    ).toBe(false);

    expect(
      await verifyTurnstileToken({
        token: 'wrong-host',
        expectedAction: 'teacher_register',
      })
    ).toBe(false);

    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
});
