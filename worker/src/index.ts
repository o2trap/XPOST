/**
 * SCATTERit as a Cloudflare Worker (free plan). /api/* is handled here; everything else is served from web/dist
 * through the ASSETS binding. The cron trigger re-validates licences (cron.ts).
 *
 * Routes:
 *   GET    /api/health
 *   POST   /api/auth/sign-in            { email, licenceKey }  -> session cookie + csrfToken
 *   POST   /api/auth/sign-out
 *   GET    /api/me                       user, licence status/reason, sessions, csrfToken
 *   DELETE /api/sessions/:id             own sessions only
 *   POST   /api/webhooks/lemonsqueezy    signed by Lemon Squeezy (no cookie, no CSRF)
 */
import { APP_NAME, APP_VERSION, type HealthResponse } from '@scatterit/shared';
import type { Ctx, Env } from './app';
import { getConfig } from './config';
import { LemonSqueezy } from './lemonsqueezy';
import { fail, json } from './http';
import { allowRequest } from './rate-limit';
import { csrfGuard, handleMe, handleRevokeSession, handleSignIn, handleSignOut, resolveSession } from './auth';
import { handleWebhook } from './webhook';
import { revalidateLicences } from './cron';
import { logError, logRequest } from './log';

export type { Env } from './app';

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/** Security headers on every response the Worker sends. */
function secured(res: Response): Response {
  const out = new Response(res.body, res);
  out.headers.set('Strict-Transport-Security', 'max-age=31536000');
  out.headers.set('X-Content-Type-Options', 'nosniff');
  out.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  out.headers.set('X-Frame-Options', 'DENY');
  out.headers.set('Content-Security-Policy', CSP);
  return out;
}

export interface AppOptions {
  /** Lemon Squeezy fetch (tests pass a fake). */
  fetch?: typeof fetch;
  /** Clock in epoch ms (tests pass a fixed one). */
  now?: () => number;
}

export function createApp(opts: AppOptions = {}) {
  const clock = opts.now ?? Date.now;

  const context = (env: Env, ip: string): Ctx => {
    const cfg = getConfig(env);
    return { env, cfg, db: env.DB, ls: new LemonSqueezy(cfg.LS_API_BASE, cfg.LS_API_KEY, opts.fetch), now: clock(), ip };
  };

  async function api(request: Request, env: Env, url: URL): Promise<Response> {
    const { pathname } = url;
    const method = request.method;
    if (pathname === '/api/health' && method === 'GET') {
      const body: HealthResponse = { ok: true, name: env.APP_NAME ?? APP_NAME, version: APP_VERSION };
      return json(body);
    }
    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
    if (!(await allowRequest(env, pathname, method, ip, clock()))) return fail('rate_limited');

    let ctx: Ctx;
    try { ctx = context(env, ip); } catch (e) { logError((e as Error).message); return fail('server_error'); }

    if (pathname === '/api/webhooks/lemonsqueezy' && method === 'POST') return handleWebhook(ctx, request);
    if (pathname === '/api/auth/sign-in' && method === 'POST') return handleSignIn(ctx, request, url);

    const sessionRoute = pathname === '/api/auth/sign-out' || pathname === '/api/me' || pathname.startsWith('/api/sessions/');
    if (!sessionRoute) return fail('not_found');
    if (!ctx.cfg.SESSION_SECRET) return fail('not_configured');

    const auth = await resolveSession(ctx, request);
    if (UNSAFE.has(method)) {
      const refused = await csrfGuard(ctx, request, url, auth);
      if (refused) return refused;
    }
    if (pathname === '/api/auth/sign-out' && method === 'POST') return handleSignOut(ctx, auth);
    if (!auth) return fail('unauthenticated');
    if (pathname === '/api/me' && method === 'GET') return handleMe(ctx, auth);
    const m = /^\/api\/sessions\/([0-9a-f]{32})$/.exec(pathname);
    if (m && method === 'DELETE') return handleRevokeSession(ctx, auth, m[1]!);
    return fail('not_found');
  }

  async function route(request: Request, env: Env, url: URL): Promise<Response> {
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      let res: Response;
      try { res = await api(request, env, url); } catch (e) { logError('api error', request.method, url.pathname, e); res = fail('server_error'); }
      let code: string | undefined;
      if (res.status >= 400 && res.headers.get('content-type')?.includes('json')) {
        code = ((await res.clone().json().catch(() => null)) as { code?: string } | null)?.code;
      }
      logRequest(request.method, url.pathname, res.status, code);
      return res;
    }
    return env.ASSETS.fetch(request);
  }

  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      const url = new URL(request.url);
      // Plain http to https. 308 keeps the method and body.
      if (url.protocol === 'http:' && !LOCAL.test(url.hostname)) {
        url.protocol = 'https:';
        return secured(Response.redirect(url.toString(), 308));
      }
      return secured(await route(request, env, url));
    },

    /** Cron trigger. Every run re-validates a small batch of licences (M4 adds the reminder sweep here). */
    async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
      let c: Ctx;
      try { c = context(env, 'cron'); } catch (e) { logError((e as Error).message); return; }
      ctx.waitUntil(revalidateLicences(c).then(() => undefined, (e) => logError('cron failed', e)));
    },
  };
}

export default createApp();
