/**
 * Forked from XLISTit website/lib/rate-limit.ts. Rate limits for API routes. Layers:
 * 1. A per-isolate memory limit, checked first; also works where the bindings don't exist (tests, local dev).
 * 2. Cloudflare's Rate Limiting API (bindings in wrangler.toml, free): counted per Cloudflare location, approximate.
 * 3. For sign-in only, a strict D1 counter of failed attempts per email (auth.ts), because 1 and 2 are approximate.
 * Sign-in calls Lemon Squeezy, so it gets tight per-address and per-email limits plus a cap for everyone together
 * (RL_UPSTREAM) that protects LS's quota. The LS webhook is not limited by address: it comes from LS's servers and is
 * checked by signature.
 * xpost changes: its own bindings (namespace IDs 8101+, unique in the account), per-email limit, no eBay/admin limits.
 */
const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

/** Memory limit: `max` requests per minute for `key` on this isolate. */
export function rateLimit(key: string, now = Date.now(), max = 20): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= max) { hits.set(key, recent); return false; }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  return true;
}
export function resetRateLimit() { hits.clear(); }

/** Cloudflare Rate Limiting binding (env.RL_*). */
export interface RateLimiter { limit(o: { key: string }): Promise<{ success: boolean }> }

/** Requests per minute. `binding` must match wrangler.toml, where the same numbers are set (a test checks). */
export const LIMITS = {
  /** POST /api/auth/sign-in per visitor address: each one calls Lemon Squeezy. */
  signIn: { perMinute: 10, binding: 'RL_SIGNIN' },
  /** POST /api/auth/sign-in per email (keyed by a hash of the email, never the email). */
  signInEmail: { perMinute: 5, binding: 'RL_SIGNIN_EMAIL' },
  /** Every other /api route, per visitor address. */
  api: { perMinute: 120, binding: 'RL_API' },
  /** Everyone together: protects the Lemon Squeezy quota from a spread-out flood. */
  upstream: { perMinute: 300, binding: 'RL_UPSTREAM' },
} as const;
export type LimitKind = keyof typeof LIMITS;

/** Strict D1 limit: failed sign-ins per email per hour. */
export const SIGNIN_FAILURES_PER_HOUR = 10;

/** Which limit an API path falls under, or null when it isn't limited by address. */
export function limitFor(pathname: string, method: string): LimitKind | null {
  if (pathname === '/api/webhooks/lemonsqueezy') return null;
  if (pathname === '/api/auth/sign-in' && method === 'POST') return 'signIn';
  if (pathname === '/api' || pathname.startsWith('/api/')) return 'api';
  return null;
}

export async function check(env: object, kind: LimitKind, key: string, now = Date.now()): Promise<boolean> {
  const { perMinute, binding } = LIMITS[kind];
  if (!rateLimit(`${kind}:${key}`, now, perMinute)) return false;
  const b = (env as Record<string, unknown>)[binding] as RateLimiter | undefined;
  if (!b || typeof b.limit !== 'function') return true;
  try { return (await b.limit({ key })).success; } catch { return true; } // a Cloudflare hiccup never blocks customers
}

/** True when this request may go ahead. `ip` is the visitor's address (cf-connecting-ip). */
export async function allowRequest(env: object, pathname: string, method: string, ip: string, now = Date.now()): Promise<boolean> {
  const kind = limitFor(pathname, method);
  if (!kind) return true;
  return check(env, kind, ip, now);
}

/** Sign-in extras, checked once the email is known: per-email limit, then the shared Lemon Squeezy cap. */
export async function allowSignIn(env: object, emailKey: string, now = Date.now()): Promise<boolean> {
  if (!(await check(env, 'signInEmail', emailKey, now))) return false;
  return check(env, 'upstream', 'lemonsqueezy', now);
}
