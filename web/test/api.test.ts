import { afterEach, describe, expect, it, vi } from 'vitest';
import { CSRF_HEADER } from '@xpost/shared';
import { revokeSession, signIn, signOut } from '../src/api';

afterEach(() => vi.unstubAllGlobals());

describe('api client', () => {
  it('sends the pre-session CSRF value on sign-in, then the session token on later changes', async () => {
    const seen: { url: string; headers: Record<string, string> }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      seen.push({ url, headers: init.headers as Record<string, string> });
      return new Response(JSON.stringify(url.endsWith('sign-in') ? { ok: true, csrfToken: 'tok123' } : { ok: true }), { status: 200 });
    });
    expect((await signIn('a@b.co', 'KEY-12345678')).ok).toBe(true);
    await signOut();
    await revokeSession('abc');
    expect(seen.map((s) => s.headers[CSRF_HEADER])).toEqual(['sign-in', 'tok123', 'tok123']);
  });

  it('passes through the plain-English error message', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ ok: false, code: 'expired', message: 'This xpost licence has expired.' }), { status: 403 }));
    const r = await signIn('a@b.co', 'KEY-12345678');
    expect(r).toMatchObject({ ok: false, status: 403, error: { code: 'expired', message: 'This xpost licence has expired.' } });
  });
});
