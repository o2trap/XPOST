/**
 * Test harness: the real Worker (createApp) against a fake Lemon Squeezy and a real local D1 (workerd, in memory)
 * from wrangler's getPlatformProxy, with worker/migrations applied. One database per test file, emptied before
 * each test.
 */
import { getPlatformProxy } from 'wrangler';
import { CSRF_HEADER, CSRF_PRESESSION } from '@scatterit/shared';
import { createApp } from '../src/index';
import type { Env } from '../src/app';
import { resetRateLimit } from '../src/rate-limit';
import { FakeLemonSqueezy } from './fake-ls';

export const BASE = 'https://scatterit.test';
export const T0 = Date.UTC(2026, 10, 14, 12, 0, 0);
export const DAY = 86_400_000;

const migrations = import.meta.glob('../migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** Splits a migration into statements (comments stripped; statements end with ";" at the end of a line). */
export function splitSql(sql: string): string[] {
  return sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')
    .split(/;\s*$/m).map((s) => s.trim()).filter(Boolean);
}

export async function startDb(): Promise<{ db: D1Database; dispose: () => Promise<void> }> {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: new URL('./wrangler.test.toml', import.meta.url).pathname, persist: false, envFiles: [], remoteBindings: false,
  });
  const db = proxy.env.DB;
  for (const file of Object.keys(migrations).sort()) {
    await db.batch(splitSql(migrations[file]!).map((s) => db.prepare(s)));
  }
  return { db, dispose: () => proxy.dispose() };
}

/** Child tables first (foreign keys are always on in D1). */
const TABLES = ['audit_log', 'auth_attempts', 'webhook_events', 'refunded_orders', 'ls_subscriptions', 'ls_object_versions', 'push_subscriptions', 'reminders', 'target_events', 'post_targets',
  'post_media', 'posts', 'media', 'sessions', 'devices', 'licences', 'users'];
export async function resetDb(db: D1Database) {
  await db.batch(TABLES.map((t) => db.prepare(`DELETE FROM ${t}`)));
  resetRateLimit();
}

export const SECRET = 'test-session-secret-0123456789abcdef';
export const WEBHOOK_SECRET = 'whsec_test';

export function makeEnv(db: D1Database, fake: FakeLemonSqueezy, extra: Partial<Env> = {}): Env {
  return {
    ASSETS: { fetch: async () => new Response('asset') },
    DB: db,
    LS_STORE_ID: '1', LS_PRODUCT_ID: '10', LS_VARIANT_IDS: '',
    LS_API_BASE: 'https://api.lemonsqueezy.test', LS_API_KEY: fake.apiKey, LS_WEBHOOK_SECRET: WEBHOOK_SECRET, SESSION_SECRET: SECRET,
    ...extra,
  };
}

export interface CallOpts { body?: unknown; raw?: string; cookie?: string | null; csrf?: string | null; origin?: string | null; headers?: Record<string, string>; ip?: string }

export function harness(db: D1Database, envExtra: Partial<Env> = {}) {
  const fake = new FakeLemonSqueezy();
  const clock = { now: T0 };
  const app = createApp({ fetch: fake.fetch as typeof fetch, now: () => clock.now });
  let env = makeEnv(db, fake, envExtra);

  async function call(method: string, path: string, o: CallOpts = {}): Promise<Response> {
    const headers = new Headers(o.headers);
    headers.set('cf-connecting-ip', o.ip ?? '203.0.113.7');
    if (o.origin !== null && method !== 'GET') headers.set('origin', o.origin ?? BASE);
    if (o.cookie) headers.set('cookie', o.cookie);
    if (o.csrf) headers.set(CSRF_HEADER, o.csrf);
    const body = o.raw ?? (o.body !== undefined ? JSON.stringify(o.body) : undefined);
    if (body !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json');
    return app.fetch(new Request(BASE + path, { method, headers, body }), env);
  }

  /** Signs in and returns the cookie header value to send back and the CSRF token. */
  async function signIn(email = 'buyer@example.com', licenceKey = 'SCATTERIT-KEY-0001', o: CallOpts = {}) {
    const res = await call('POST', '/api/auth/sign-in', { body: { email, licenceKey }, csrf: CSRF_PRESESSION, ...o });
    const setCookie = res.headers.get('set-cookie') ?? '';
    const cookie = setCookie.split(';')[0] ?? '';
    const body = (await res.clone().json()) as { ok: boolean; csrfToken?: string; code?: string; message?: string };
    return { res, body, cookie, setCookie, csrf: body.csrfToken ?? '' };
  }

  return {
    fake, clock, app, call, signIn,
    get env() { return env; },
    setEnv(extra: Partial<Env>) { env = makeEnv(db, fake, { ...envExtra, ...extra }); },
  };
}

/** Lemon Squeezy-style X-Signature: hex HMAC-SHA256 of the raw body. */
export async function lsSign(body: string, secret = WEBHOOK_SECRET): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body)))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Runs the Worker's cron handler and waits for everything it scheduled with waitUntil. */
export async function runCron(h: { app: ReturnType<typeof createApp>; env: Env; clock: { now: number } }) {
  const waits: Promise<unknown>[] = [];
  await h.app.scheduled({ cron: '*/15 * * * *', scheduledTime: h.clock.now, noRetry() {} } as ScheduledController, h.env,
    { waitUntil: (p: Promise<unknown>) => waits.push(p), passThroughOnException() {} } as unknown as ExecutionContext);
  await Promise.all(waits);
}
