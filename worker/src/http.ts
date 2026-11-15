import type { ApiError, ApiErrorCode } from '@xpost/shared';

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

/** Plain-English messages, safe to show. Sign-in failures stay generic except expired/refunded/disabled. */
export const MESSAGES: Record<ApiErrorCode, string> = {
  bad_request: 'Please check what you entered and try again.',
  invalid_credentials: "That email and licence key don't match an xpost licence. Check both and try again.",
  expired: 'This xpost licence has expired. Renew it in Lemon Squeezy, then sign in again.',
  refunded: "This xpost licence was refunded, so it can't be used any more. Buy xpost again to carry on.",
  disabled: 'This xpost licence key has been disabled. Contact support if you think this is a mistake.',
  not_configured: "Sign-in isn't available yet: xpost's licence settings haven't been set up.",
  rate_limited: 'Too many attempts. Wait a little and try again.',
  unauthenticated: 'Please sign in.',
  csrf: 'This request was blocked for your security. Reload the page and try again.',
  forbidden_origin: 'Requests from other websites are not allowed.',
  not_found: 'Not found.',
  licence_blocked: 'Your xpost licence is not active.',
  upstream_error: "We couldn't reach the licence server. Try again in a minute.",
  server_error: 'Something went wrong on our side. Try again in a minute.',
};

export const STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400, invalid_credentials: 401, expired: 403, refunded: 403, disabled: 403, not_configured: 503,
  rate_limited: 429, unauthenticated: 401, csrf: 403, forbidden_origin: 403, not_found: 404, licence_blocked: 403,
  upstream_error: 502, server_error: 500,
};

export function fail(code: ApiErrorCode, headers: Record<string, string> = {}): Response {
  const body: ApiError = { ok: false, code, message: MESSAGES[code] };
  return json(body, STATUS[code], code === 'rate_limited' ? { 'Retry-After': '60', ...headers } : headers);
}

/** Reads a small JSON body; null when it is missing, too large or not JSON. */
export async function readJson(req: Request, maxBytes = 4096): Promise<unknown> {
  const text = await req.text().catch(() => '');
  if (!text || text.length > maxBytes) return null;
  try { return JSON.parse(text); } catch { return null; }
}
