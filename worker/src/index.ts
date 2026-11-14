/**
 * xpost as a Cloudflare Worker (free plan). /api/* is handled here; everything else is served from web/dist
 * through the ASSETS binding.
 */
import { APP_NAME, APP_VERSION, type HealthResponse } from '@xpost/shared';

export interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
  APP_NAME?: string;
}

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;

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

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

async function route(request: Request, env: Env, url: URL): Promise<Response> {
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    if (url.pathname === '/api/health' && request.method === 'GET') {
      const body: HealthResponse = { ok: true, name: env.APP_NAME ?? APP_NAME, version: APP_VERSION };
      return json(body);
    }
    return json({ error: 'Not found' }, 404);
  }
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    // Plain http to https. 308 keeps the method and body.
    if (url.protocol === 'http:' && !LOCAL.test(url.hostname)) {
      url.protocol = 'https:';
      return secured(Response.redirect(url.toString(), 308));
    }
    return secured(await route(request, env, url));
  },
};
