/**
 * Web sign-in, sessions and CSRF.
 *
 * Session: a random 256-bit token in the cookie `__Host-xpost_session` (HttpOnly, Secure, SameSite=Lax, Path=/,
 * no Domain). D1 stores only SHA-256(token). Sessions expire after SESSION_TTL_DAYS; each licence may have
 * MAX_WEB_SESSIONS live web sessions (the oldest is revoked when a new one starts).
 *
 * CSRF (every state-changing /api request except the signed LS webhook):
 *  1. Same-origin check: `Sec-Fetch-Site` must be `same-origin` when sent, and `Origin` must equal the request's
 *     own origin. A request with neither header is refused (browsers always send Origin on POST/DELETE).
 *  2. Header `X-XPOST-CSRF`: before sign-in it must be present (the fixed value "sign-in"; a custom header cannot be
 *     sent cross-site without a CORS preflight, which xpost never grants). With a session it must equal
 *     HMAC-SHA256(SESSION_SECRET, "csrf:" + session id), which the client gets from sign-in and GET /api/me.
 *  SameSite=Lax on the cookie is a third layer.
 */
import { z } from 'zod';
import { CSRF_HEADER, CSRF_PRESESSION, type MeResponse, type SessionInfo, type LicenceStatus } from '@xpost/shared';
import type { Ctx } from './app';
import { DAY_MS, HOUR_MS, licenceConfigured } from './config';
import { fail, json, readJson } from './http';
import { fromBase64url, hmacB64, hmacHex, hmacVerify, randomId, randomToken, sha256Hex } from './crypto';
import { Email, LicenceKey, checkForSignIn, deriveStatus, keyLast4, licenceKeyHash } from './licence';
import { allowSignIn, SIGNIN_FAILURES_PER_HOUR } from './rate-limit';
import { syncPauseStatements } from './pause';
import { licenceInfo, type LicenceRow } from './gate';
import { logError } from './log';
import { LemonSqueezyError } from './lemonsqueezy';

export const COOKIE_NAME = '__Host-xpost_session';
/** last_seen_at is written at most this often per session (saves D1 writes). */
export const LAST_SEEN_EVERY_MS = 5 * 60_000;

export const SignInBody = z.object({ email: Email, licenceKey: LicenceKey });

// ---- cookies ----

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}
export const sessionCookie = (token: string, maxAgeSeconds: number) =>
  `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
export const clearSessionCookie = () => `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

/** A short, non-identifying label such as "Chrome on Windows" (max 60 chars). */
export function shortUserAgent(ua: string | null): string | null {
  if (!ua) return null;
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /xpost/i.test(ua) ? 'xpost app' : 'Browser';
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : null;
  return (os ? `${browser} on ${os}` : browser).slice(0, 60);
}

// ---- CSRF ----

const LOCALHOST = /^(localhost|127\.0\.0\.1|\[::1\])$/;

/** Same-origin check for state-changing requests (see the header comment). */
export function sameOrigin(req: Request, url: URL): boolean {
  const site = req.headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin') return false;
  const origin = req.headers.get('origin');
  if (origin === null) return site === 'same-origin';
  if (origin === url.origin) return true;
  // Local development only: the Vite dev server (localhost:5173) proxies to wrangler dev (localhost:8787).
  try { const o = new URL(origin); return LOCALHOST.test(o.hostname) && LOCALHOST.test(url.hostname); } catch { return false; }
}

export const csrfToken = (secret: string, sessionId: string) => hmacB64(secret, `csrf:${sessionId}`);

async function csrfValid(secret: string, sessionId: string, header: string | null): Promise<boolean> {
  const mac = header ? fromBase64url(header) : null;
  return !!mac && mac.length === 32 && hmacVerify(secret, `csrf:${sessionId}`, mac);
}

// ---- sessions ----

export interface Auth {
  sessionId: string;
  userId: string;
  email: string;
  licenceId: string;
  licence: LicenceRow;
}

/** Resolves the session cookie: not revoked, not expired, user not deleted. Updates last_seen_at sparingly. */
export async function resolveSession(ctx: Ctx, req: Request): Promise<Auth | null> {
  const token = readCookie(req, COOKIE_NAME);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const row = await ctx.db.prepare(
    `SELECT s.id AS session_id, s.user_id, s.licence_id, s.last_seen_at AS session_seen, u.email,
            l.status, l.status_reason, l.expires_at, l.key_last4, l.last_validated_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id AND u.deleted_at IS NULL
       JOIN licences l ON l.id = s.licence_id AND l.user_id = s.user_id
      WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?`,
  ).bind(await sha256Hex(token), ctx.now).first<{
    session_id: string; user_id: string; licence_id: string; session_seen: number; email: string;
    status: LicenceStatus; status_reason: string | null; expires_at: number | null; key_last4: string; last_validated_at: number;
  }>();
  if (!row) return null;
  if (ctx.now - row.session_seen > LAST_SEEN_EVERY_MS) {
    await ctx.db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').bind(ctx.now, row.session_id).run();
  }
  return {
    sessionId: row.session_id, userId: row.user_id, email: row.email, licenceId: row.licence_id,
    licence: { status: row.status, status_reason: row.status_reason, expires_at: row.expires_at, key_last4: row.key_last4, last_validated_at: row.last_validated_at },
  };
}

/**
 * Guard for state-changing requests: same origin plus the CSRF header. With `auth`, the header must be the
 * session's token. Returns a Response to send when the request is refused.
 */
export async function csrfGuard(ctx: Ctx, req: Request, url: URL, auth: Auth | null): Promise<Response | null> {
  if (!sameOrigin(req, url)) return fail('forbidden_origin');
  const header = req.headers.get(CSRF_HEADER);
  if (!header) return fail('csrf');
  if (auth && !(await csrfValid(ctx.cfg.SESSION_SECRET!, auth.sessionId, header))) return fail('csrf');
  return null;
}

const keyed = (ctx: Ctx, purpose: string, value: string) => hmacHex(ctx.cfg.SESSION_SECRET!, `${purpose}:${value}`).then((h) => h.slice(0, 32));

// ---- handlers ----

/** POST /api/auth/sign-in { email, licenceKey } */
export async function handleSignIn(ctx: Ctx, req: Request, url: URL): Promise<Response> {
  const { cfg, db, now } = ctx;
  if (!licenceConfigured(cfg)) return fail('not_configured');
  // Before a session exists the header only has to be present (see header comment).
  const guard = await csrfGuard(ctx, req, url, null);
  if (guard) return guard;
  if (req.headers.get(CSRF_HEADER) !== CSRF_PRESESSION) return fail('csrf');
  const parsed = SignInBody.safeParse(await readJson(req));
  if (!parsed.success) return fail('bad_request');
  const { email, licenceKey } = parsed.data;

  const emailKey = `email:${await keyed(ctx, 'rl', email)}`;
  if (!(await allowSignIn(ctx.env, emailKey, now))) return fail('rate_limited');
  const attempts = await db.prepare('SELECT window_start, count FROM auth_attempts WHERE key = ?').bind(emailKey).first<{ window_start: number; count: number }>();
  if (attempts && attempts.window_start > now - HOUR_MS && attempts.count >= SIGNIN_FAILURES_PER_HOUR) return fail('rate_limited', { 'Retry-After': '3600' });

  let res;
  try { res = await ctx.ls.validate(licenceKey); } catch (e) {
    logError('sign-in: licence check failed', e instanceof LemonSqueezyError ? e.message : e);
    return fail('upstream_error');
  }
  const keyHash = await licenceKeyHash(licenceKey);
  const existing = await db.prepare('SELECT id, user_id, status, status_reason FROM licences WHERE ls_license_key_hash = ?')
    .bind(keyHash).first<{ id: string; user_id: string; status: LicenceStatus; status_reason: string | null }>();
  const checked = checkForSignIn(cfg, res.body, email, now);
  const ipHash = await keyed(ctx, 'ip', ctx.ip);

  // A refund is sticky: LS has no "refunded" key status, so xpost's own record decides.
  const refunded = existing?.status === 'refunded' && (checked.ok || checked.code === 'disabled' || checked.code === 'expired');
  if (!checked.ok || refunded) {
    const code = refunded ? 'refunded' : (checked as { code: 'invalid_credentials' | 'expired' | 'disabled' | 'not_configured' }).code;
    const stmts = [
      db.prepare(`INSERT INTO auth_attempts (key, window_start, count) VALUES (?1, ?2, 1)
        ON CONFLICT (key) DO UPDATE SET count = CASE WHEN window_start <= ?3 THEN 1 ELSE count + 1 END,
                                        window_start = CASE WHEN window_start <= ?3 THEN ?2 ELSE window_start END`)
        .bind(emailKey, now, now - HOUR_MS),
      db.prepare("INSERT INTO audit_log (user_id, at, kind, code, ip_hash) VALUES (NULL, ?, 'sign_in_failed', ?, ?)").bind(now, code, ipHash),
    ];
    // The right key and email, but LS says expired/disabled: record it (and pause the owner's reminders).
    if (existing && !refunded && (code === 'expired' || code === 'disabled') && existing.status !== code) {
      stmts.push(db.prepare('UPDATE licences SET status = ?, status_reason = ?, last_validated_at = ?, updated_at = ? WHERE id = ?').bind(code, code, now, now, existing.id));
      stmts.push(...syncPauseStatements(db, existing.user_id, now));
    }
    await db.batch(stmts);
    return fail(code);
  }

  const v = checked.licence;
  const next = deriveStatus(existing, { status: v.lsKeyStatus, expiresAt: v.expiresAt }, now);
  const user = await db.prepare(
    `INSERT INTO users (id, email, created_at, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (email) DO UPDATE SET updated_at = excluded.updated_at RETURNING id`,
  ).bind(randomId(), email, now, now).first<{ id: string }>();
  if (!user) return fail('server_error');

  const licenceId = existing?.id ?? randomId();
  const sessionId = randomId();
  const token = randomToken();
  const ttlMs = cfg.SESSION_TTL_DAYS * DAY_MS;
  const keep = cfg.MAX_WEB_SESSIONS - 1; // live web sessions kept besides the new one
  const L = `(SELECT id FROM licences WHERE ls_license_key_hash = ?)`;
  const stmts: D1PreparedStatement[] = [
    db.prepare(
      `INSERT INTO licences (id, user_id, ls_license_key_hash, key_last4, ls_license_key_id, ls_store_id, ls_product_id, ls_variant_id,
         ls_order_id, ls_customer_email, ls_key_status, status, status_reason, expires_at, activation_limit, last_validated_at, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?16, ?16)
       ON CONFLICT (ls_license_key_hash) DO UPDATE SET user_id = excluded.user_id, key_last4 = excluded.key_last4,
         ls_license_key_id = excluded.ls_license_key_id, ls_store_id = excluded.ls_store_id, ls_product_id = excluded.ls_product_id,
         ls_variant_id = excluded.ls_variant_id, ls_order_id = excluded.ls_order_id, ls_customer_email = excluded.ls_customer_email,
         ls_key_status = excluded.ls_key_status, status = excluded.status, status_reason = excluded.status_reason,
         expires_at = excluded.expires_at, activation_limit = excluded.activation_limit,
         last_validated_at = excluded.last_validated_at, updated_at = excluded.updated_at`,
    ).bind(licenceId, user.id, keyHash, keyLast4(licenceKey), v.lsKeyId, v.storeId, v.productId, v.variantId, v.orderId,
      v.customerEmail, v.lsKeyStatus, next.status, next.reason, v.expiresAt, v.activationLimit, now),
    // The licence's customer email changed in LS: sessions of the previous owner end.
    db.prepare(`UPDATE sessions SET revoked_at = ?1, revoked_reason = 'licence_moved'
      WHERE licence_id = ${L.replace('?', '?2')} AND user_id <> ?3 AND revoked_at IS NULL`).bind(now, keyHash, user.id),
    // Session limit: keep the newest MAX_WEB_SESSIONS-1 live web sessions of this licence, revoke the rest.
    db.prepare(`UPDATE sessions SET revoked_at = ?1, revoked_reason = 'session_limit' WHERE id IN (
        SELECT id FROM sessions WHERE licence_id = ${L.replace('?', '?2')} AND kind = 'web' AND revoked_at IS NULL AND expires_at > ?1
        ORDER BY created_at DESC, id LIMIT -1 OFFSET ?3)`).bind(now, keyHash, keep),
    db.prepare(`INSERT INTO audit_log (user_id, at, kind, code, ip_hash)
      SELECT user_id, ?1, 'session_evicted', 'session_limit', ?3 FROM sessions
      WHERE licence_id = ${L.replace('?', '?2')} AND revoked_at = ?1 AND revoked_reason = 'session_limit'`).bind(now, keyHash, ipHash),
    db.prepare(`INSERT INTO sessions (id, token_hash, user_id, licence_id, kind, user_agent, created_at, last_seen_at, expires_at)
      VALUES (?1, ?2, ?3, ${L.replace('?', '?4')}, 'web', ?5, ?6, ?6, ?7)`)
      .bind(sessionId, await sha256Hex(token), user.id, keyHash, shortUserAgent(req.headers.get('user-agent')), now, now + ttlMs),
    db.prepare("INSERT INTO audit_log (user_id, at, kind, code, ip_hash) VALUES (?, ?, 'sign_in', NULL, ?)").bind(user.id, now, ipHash),
    db.prepare('DELETE FROM auth_attempts WHERE key = ?').bind(emailKey),
    ...syncPauseStatements(db, user.id, now),
  ];
  await db.batch(stmts);
  return json({ ok: true, csrfToken: await csrfToken(cfg.SESSION_SECRET!, sessionId) }, 200, {
    'Set-Cookie': sessionCookie(token, Math.floor(ttlMs / 1000)),
  });
}

/** POST /api/auth/sign-out. Always clears the cookie; revokes the session when there is one. */
export async function handleSignOut(ctx: Ctx, auth: Auth | null): Promise<Response> {
  if (auth) {
    await ctx.db.batch([
      ctx.db.prepare("UPDATE sessions SET revoked_at = ?, revoked_reason = 'sign_out' WHERE id = ? AND user_id = ? AND revoked_at IS NULL").bind(ctx.now, auth.sessionId, auth.userId),
      ctx.db.prepare("INSERT INTO audit_log (user_id, at, kind) VALUES (?, ?, 'sign_out')").bind(auth.userId, ctx.now),
    ]);
  }
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
}

/** GET /api/me */
export async function handleMe(ctx: Ctx, auth: Auth): Promise<Response> {
  const rows = await ctx.db.prepare(
    `SELECT id, kind, user_agent, created_at, last_seen_at, expires_at FROM sessions
      WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY last_seen_at DESC LIMIT 20`,
  ).bind(auth.userId, ctx.now).all<{ id: string; kind: 'web' | 'desktop'; user_agent: string | null; created_at: number; last_seen_at: number; expires_at: number }>();
  const sessions: SessionInfo[] = rows.results.map((s) => ({
    id: s.id, kind: s.kind, userAgent: s.user_agent, createdAt: s.created_at, lastSeenAt: s.last_seen_at, expiresAt: s.expires_at, current: s.id === auth.sessionId,
  }));
  const body: MeResponse = {
    ok: true,
    user: { id: auth.userId, email: auth.email },
    licence: licenceInfo(auth.licence, ctx.now),
    sessions,
    limits: { maxWebSessions: ctx.cfg.MAX_WEB_SESSIONS },
    csrfToken: await csrfToken(ctx.cfg.SESSION_SECRET!, auth.sessionId),
  };
  return json(body);
}

/** DELETE /api/sessions/:id. Only the signed-in user's own sessions. */
export async function handleRevokeSession(ctx: Ctx, auth: Auth, id: string): Promise<Response> {
  const res = await ctx.db.prepare(
    "UPDATE sessions SET revoked_at = ?, revoked_reason = 'user_revoked' WHERE id = ? AND user_id = ? AND revoked_at IS NULL",
  ).bind(ctx.now, id, auth.userId).run();
  // Someone else's session and a non-existent one look the same.
  if (!res.meta.changes) return fail('not_found');
  await ctx.db.prepare("INSERT INTO audit_log (user_id, at, kind, code) VALUES (?, ?, 'session_revoked', NULL)").bind(auth.userId, ctx.now).run();
  return json({ ok: true }, 200, id === auth.sessionId ? { 'Set-Cookie': clearSessionCookie() } : {});
}
