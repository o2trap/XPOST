/**
 * Forked from XLISTit website/lib/log.ts. Server log (Cloudflare Workers logs) with secrets and personal details
 * removed. Rules: log endpoint, status and error codes only. Never request bodies, licence keys, emails, tokens,
 * cookies or captions. Everything still goes through scrubSecrets as a backstop.
 */
import { scrubSecrets } from './scrub';

const safeJson = (v: unknown) => { try { return JSON.stringify(v); } catch { return String(v); } };
const clean = (a: unknown) => scrubSecrets(a instanceof Error ? `${a.name}: ${a.message}` : typeof a === 'string' ? a : safeJson(a));

export function logError(...args: unknown[]) {
  console.error(...args.map(clean));
}
export function logInfo(...args: unknown[]) {
  console.log(...args.map(clean));
}

/** Path with IDs replaced, e.g. /api/sessions/:id. */
export const routeLabel = (pathname: string) => pathname.replace(/\/[0-9a-f]{32}(?=\/|$)/gi, '/:id').slice(0, 100);

/** One line per API request: method, route, status, optional error code. */
export function logRequest(method: string, pathname: string, status: number, code?: string) {
  logInfo(`${method} ${routeLabel(pathname)} ${status}${code ? ` ${code}` : ''}`);
}
