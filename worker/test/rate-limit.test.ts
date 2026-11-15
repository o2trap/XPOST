import { beforeEach, describe, expect, it } from 'vitest';
import toml from '../../wrangler.toml?raw';
import { LIMITS, allowRequest, allowSignIn, limitFor, resetRateLimit, type RateLimiter } from '../src/rate-limit';

beforeEach(() => resetRateLimit());

describe('rate limits (forked from XLISTit)', () => {
  it('cover every API route, tightest on sign-in; the signed webhook is not limited by address', () => {
    expect(limitFor('/api/auth/sign-in', 'POST')).toBe('signIn');
    for (const p of ['/api/me', '/api/auth/sign-out', '/api/sessions/x', '/api/anything']) expect(limitFor(p, 'GET')).toBe('api');
    expect(limitFor('/api/webhooks/lemonsqueezy', 'POST')).toBeNull();
    expect(limitFor('/', 'GET')).toBeNull();
    expect(LIMITS.signIn.perMinute).toBeLessThan(LIMITS.api.perMinute);
  });

  it("use Cloudflare's shared counters when bound, including the cap for everyone on Lemon Squeezy", async () => {
    const seen: string[] = [];
    const rl = (name: string, ok = true): RateLimiter => ({ limit: async ({ key }) => { seen.push(`${name}:${key}`); return { success: ok }; } });
    expect(await allowRequest({ RL_SIGNIN: rl('RL_SIGNIN', false) }, '/api/auth/sign-in', 'POST', '5.5.5.5')).toBe(false);
    expect(await allowSignIn({ RL_SIGNIN_EMAIL: rl('RL_SIGNIN_EMAIL'), RL_UPSTREAM: rl('RL_UPSTREAM', false) }, 'email:abc')).toBe(false);
    expect(seen).toEqual(['RL_SIGNIN:5.5.5.5', 'RL_SIGNIN_EMAIL:email:abc', 'RL_UPSTREAM:lemonsqueezy']);
    // a Cloudflare error never blocks customers
    expect(await allowRequest({ RL_API: { limit: async () => { throw new Error('down'); } } }, '/api/me', 'GET', '4.4.4.4')).toBe(true);
  });

  it('wrangler.toml sets the same numbers as the code, with namespace IDs distinct from XLISTit (7101-7106)', () => {
    for (const { binding, perMinute } of Object.values(LIMITS)) {
      expect(toml, binding).toMatch(new RegExp(`name = "${binding}"\\nnamespace_id = "(\\d+)"\\nsimple = \\{ limit = ${perMinute}, period = 60 \\}`));
    }
    const ids = [...toml.matchAll(/namespace_id = "(\d+)"/g)].map((m) => Number(m[1]));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id < 7101 || id > 7106).toBe(true);
  });
});
