import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CSRF_PRESESSION } from '@scatterit/shared';
import { BASE, DAY, harness, resetDb, startDb } from './harness';

let db: D1Database, dispose: () => Promise<void>;
beforeAll(async () => ({ db, dispose } = await startDb()));
afterAll(() => dispose());
beforeEach(() => resetDb(db));

const KEY = 'SCATTERIT-KEY-0001';
const setupKey = (h: ReturnType<typeof harness>, extra: Parameters<typeof h.fake.addKey>[0] = { key: KEY }) => h.fake.addKey({ customerEmail: 'Buyer@Example.com', ...extra });
const me = async (h: ReturnType<typeof harness>, cookie: string) => h.call('GET', '/api/me', { cookie });

describe('sign-in', () => {
  it('valid key + matching email creates a session with a secure cookie', async () => {
    const h = harness(db);
    setupKey(h);
    const s = await h.signIn('  BUYER@example.com ', KEY);
    expect(s.res.status).toBe(200);
    expect(s.body.ok).toBe(true);
    expect(s.csrf).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // cookie flags
    expect(s.setCookie).toMatch(/^__Host-scatterit_session=[A-Za-z0-9_-]{43}; /);
    for (const flag of ['Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax', `Max-Age=${30 * 86400}`]) expect(s.setCookie).toContain(flag);
    expect(s.setCookie).not.toMatch(/Domain=/i);
    // web sign-in validates only: no LS instance (device slot) is used
    expect(h.fake.calls).toEqual(['POST /v1/licenses/validate']);
    expect([...h.fake.keys.values()][0]!.instances).toHaveLength(0);

    const res = await me(h, s.cookie);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.user.email).toBe('buyer@example.com');
    expect(body.licence).toMatchObject({ status: 'active', canPost: true, keyLast4: '0001', message: null });
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0].current).toBe(true);
    expect(body.csrfToken).toBe(s.csrf);
  });

  it('stores only hashes: never the licence key or the session token', async () => {
    const h = harness(db);
    setupKey(h);
    const s = await h.signIn('buyer@example.com', KEY);
    const token = s.cookie.split('=')[1]!;
    const lic = await db.prepare('SELECT * FROM licences').first<Record<string, unknown>>();
    const ses = await db.prepare('SELECT * FROM sessions').first<Record<string, unknown>>();
    const dump = JSON.stringify([lic, ses]);
    expect(dump).not.toContain(KEY);
    expect(dump).not.toContain(token);
    expect(lic!.ls_license_key_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(ses!.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(ses!.user_agent === null || String(ses!.user_agent).length <= 60).toBe(true);
  });

  it('wrong email is refused with the generic message', async () => {
    const h = harness(db);
    setupKey(h);
    const s = await h.signIn('someone@example.com', KEY);
    expect(s.res.status).toBe(401);
    expect(s.body.code).toBe('invalid_credentials');
    expect(s.res.headers.get('set-cookie')).toBeNull();
    // the same message as an unknown key, so it doesn't reveal which part was wrong
    const unknown = await h.signIn('buyer@example.com', 'NOPE-NOPE-NOPE');
    expect(unknown.body).toEqual(s.body);
  });

  it("rejects an XLISTit key (same store, other product) and other stores, with the generic message", async () => {
    const h = harness(db);
    setupKey(h, { key: 'XLISTIT-KEY-01', productId: 20 });
    setupKey(h, { key: 'OTHERSTORE-01', storeId: 99 });
    for (const key of ['XLISTIT-KEY-01', 'OTHERSTORE-01']) {
      const s = await h.signIn('buyer@example.com', key);
      expect(s.res.status).toBe(401);
      expect(s.body.code).toBe('invalid_credentials');
    }
    expect((await db.prepare('SELECT count(*) n FROM licences').first<{ n: number }>())!.n).toBe(0);
  });

  it('even an expired XLISTit key gets the generic message (no status leak for other products)', async () => {
    const h = harness(db);
    setupKey(h, { key: 'XLISTIT-KEY-02', productId: 20, status: 'expired' });
    expect((await h.signIn('buyer@example.com', 'XLISTIT-KEY-02')).body.code).toBe('invalid_credentials');
  });

  it('enforces LS_VARIANT_IDS when configured', async () => {
    const h = harness(db, { LS_VARIANT_IDS: '300, 301' });
    setupKey(h, { key: 'VARIANT-100-KEY', variantId: 100 });
    setupKey(h, { key: 'VARIANT-301-KEY', variantId: 301, orderId: 501 });
    expect((await h.signIn('buyer@example.com', 'VARIANT-100-KEY')).body.code).toBe('invalid_credentials');
    expect((await h.signIn('buyer@example.com', 'VARIANT-301-KEY')).res.status).toBe(200);
  });

  it('fails closed when the product IDs or session secret are not set', async () => {
    for (const extra of [{ LS_PRODUCT_ID: '' }, { LS_STORE_ID: '' }, { SESSION_SECRET: '' }]) {
      const h = harness(db, extra);
      setupKey(h);
      const s = await h.signIn('buyer@example.com', KEY);
      expect(s.res.status).toBe(503);
      expect(s.body.code).toBe('not_configured');
      expect(s.body.message).toMatch(/isn't available yet/);
      expect(h.fake.calls).toEqual([]); // never even asks Lemon Squeezy
    }
  });

  it('gives distinct plain-English reasons for expired and disabled licences', async () => {
    const h = harness(db);
    setupKey(h, { key: 'EXPIRED-KEY-01', status: 'expired' });
    setupKey(h, { key: 'PASTDATE-KEY-01', status: 'active', expiresAt: new Date(Date.UTC(2026, 0, 1)).toISOString(), orderId: 502 });
    setupKey(h, { key: 'DISABLED-KEY-01', status: 'disabled', orderId: 503 });
    const e = await h.signIn('buyer@example.com', 'EXPIRED-KEY-01');
    expect(e.res.status).toBe(403);
    expect(e.body).toMatchObject({ code: 'expired', message: expect.stringMatching(/expired/) });
    expect((await h.signIn('buyer@example.com', 'PASTDATE-KEY-01')).body.code).toBe('expired');
    const d = await h.signIn('buyer@example.com', 'DISABLED-KEY-01');
    expect(d.body).toMatchObject({ code: 'disabled', message: expect.stringMatching(/disabled/) });
  });

  it('a refunded licence stays refused with its own reason, even if LS still says active', async () => {
    const h = harness(db);
    setupKey(h);
    await h.signIn('buyer@example.com', KEY);
    await db.prepare("UPDATE licences SET status = 'refunded', status_reason = 'refunded'").run();
    const s = await h.signIn('buyer@example.com', KEY);
    expect(s.res.status).toBe(403);
    expect(s.body).toMatchObject({ code: 'refunded', message: expect.stringMatching(/refunded/) });
  });

  it('records a licence that LS now reports as expired', async () => {
    const h = harness(db);
    const k = setupKey(h);
    await h.signIn('buyer@example.com', KEY);
    k.status = 'expired';
    expect((await h.signIn('buyer@example.com', KEY)).body.code).toBe('expired');
    expect((await db.prepare('SELECT status FROM licences').first<{ status: string }>())!.status).toBe('expired');
  });

  it('keeps at most MAX_WEB_SESSIONS web sessions per licence, revoking the oldest', async () => {
    const h = harness(db, { MAX_WEB_SESSIONS: '2' });
    setupKey(h);
    const a = await h.signIn(); h.clock.now += 1000;
    const b = await h.signIn(); h.clock.now += 1000;
    const c = await h.signIn();
    expect((await me(h, a.cookie)).status).toBe(401); // oldest evicted
    expect((await me(h, b.cookie)).status).toBe(200);
    const body = await (await me(h, c.cookie)).json() as any;
    expect(body.sessions).toHaveLength(2);
    expect(body.limits.maxWebSessions).toBe(2);
    const ev = await db.prepare("SELECT revoked_reason FROM sessions WHERE revoked_at IS NOT NULL").all<{ revoked_reason: string }>();
    expect(ev.results.map((r) => r.revoked_reason)).toEqual(['session_limit']);
    expect((await db.prepare("SELECT count(*) n FROM audit_log WHERE kind = 'session_evicted'").first<{ n: number }>())!.n).toBe(1);
  });

  it('LS down gives a plain upstream error', async () => {
    const h = harness(db);
    setupKey(h);
    h.fake.down = 503;
    const s = await h.signIn();
    expect(s.res.status).toBe(502);
    expect(s.body.code).toBe('upstream_error');
  });

  it('rejects bad input', async () => {
    const h = harness(db);
    for (const body of [{}, { email: 'not-an-email', licenceKey: KEY }, { email: 'a@b.co', licenceKey: 'bad key!' }]) {
      const res = await h.call('POST', '/api/auth/sign-in', { body, csrf: CSRF_PRESESSION });
      expect(res.status).toBe(400);
    }
    expect((await h.call('POST', '/api/auth/sign-in', { raw: '{nope', csrf: CSRF_PRESESSION })).status).toBe(400);
  });
});

describe('sessions', () => {
  it('GET /api/me needs a valid session', async () => {
    const h = harness(db);
    expect((await me(h, '')).status).toBe(401);
    expect((await me(h, '__Host-scatterit_session=' + 'A'.repeat(43))).status).toBe(401);
    expect((await h.call('GET', '/api/me')).status).toBe(401);
  });

  it('expired sessions are rejected', async () => {
    const h = harness(db, { SESSION_TTL_DAYS: '1' });
    setupKey(h);
    const s = await h.signIn();
    h.clock.now += DAY + 1;
    expect((await me(h, s.cookie)).status).toBe(401);
  });

  it('updates last_seen_at sparingly', async () => {
    const h = harness(db);
    setupKey(h);
    const s = await h.signIn();
    const seen = async () => (await db.prepare('SELECT last_seen_at t FROM sessions').first<{ t: number }>())!.t;
    const t0 = await seen();
    h.clock.now += 60_000;
    await me(h, s.cookie);
    expect(await seen()).toBe(t0);
    h.clock.now += 5 * 60_000;
    await me(h, s.cookie);
    expect(await seen()).toBe(h.clock.now);
  });

  it('sign-out revokes the session and clears the cookie', async () => {
    const h = harness(db);
    setupKey(h);
    const s = await h.signIn();
    const res = await h.call('POST', '/api/auth/sign-out', { cookie: s.cookie, csrf: s.csrf });
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toMatch(/^__Host-scatterit_session=; .*Max-Age=0/);
    expect((await me(h, s.cookie)).status).toBe(401);
  });

  it('can revoke its own other session, but not another user\'s (ownership)', async () => {
    const h = harness(db);
    setupKey(h);
    h.fake.addKey({ key: 'OTHER-USER-KEY', customerEmail: 'other@example.com', orderId: 900 });
    const mine1 = await h.signIn();
    const mine2 = await h.signIn();
    const theirs = await h.signIn('other@example.com', 'OTHER-USER-KEY');
    const theirId = ((await (await me(h, theirs.cookie)).json()) as any).sessions[0].id as string;
    const mineIds = ((await (await me(h, mine1.cookie)).json()) as any).sessions.map((x: any) => x.id) as string[];
    expect(mineIds).not.toContain(theirId);

    const refused = await h.call('DELETE', `/api/sessions/${theirId}`, { cookie: mine1.cookie, csrf: mine1.csrf });
    expect(refused.status).toBe(404);
    expect((await me(h, theirs.cookie)).status).toBe(200);

    const mine2Id = ((await (await me(h, mine2.cookie)).json()) as any).sessions.find((x: any) => x.current).id as string;
    const ok = await h.call('DELETE', `/api/sessions/${mine2Id}`, { cookie: mine1.cookie, csrf: mine1.csrf });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('set-cookie')).toBeNull(); // not the current session
    expect((await me(h, mine2.cookie)).status).toBe(401);
    expect((await me(h, mine1.cookie)).status).toBe(200);
  });
});

describe('CSRF', () => {
  it('sign-in needs the CSRF header and a same-origin request', async () => {
    const h = harness(db);
    setupKey(h);
    const body = { email: 'buyer@example.com', licenceKey: KEY };
    expect((await h.call('POST', '/api/auth/sign-in', { body })).status).toBe(403); // no header
    expect((await h.call('POST', '/api/auth/sign-in', { body, csrf: CSRF_PRESESSION, origin: 'https://evil.example' })).status).toBe(403);
    expect((await h.call('POST', '/api/auth/sign-in', { body, csrf: CSRF_PRESESSION, origin: null })).status).toBe(403); // no Origin
    expect((await h.call('POST', '/api/auth/sign-in', { body, csrf: CSRF_PRESESSION, headers: { 'sec-fetch-site': 'cross-site' } })).status).toBe(403);
    expect(h.fake.calls).toEqual([]);
    expect((await h.call('POST', '/api/auth/sign-in', { body, csrf: CSRF_PRESESSION, headers: { 'sec-fetch-site': 'same-origin' } })).status).toBe(200);
  });

  it('session routes need the session\'s own token and same origin', async () => {
    const h = harness(db);
    setupKey(h);
    h.fake.addKey({ key: 'OTHER-USER-KEY', customerEmail: 'other@example.com', orderId: 900 });
    const s = await h.signIn();
    const other = await h.signIn('other@example.com', 'OTHER-USER-KEY');
    const out = (o: object) => h.call('POST', '/api/auth/sign-out', { cookie: s.cookie, ...o });
    const r1 = await out({});
    expect(r1.status).toBe(403);
    expect(((await r1.json()) as any).code).toBe('csrf');
    expect((await out({ csrf: 'sign-in' })).status).toBe(403);
    expect((await out({ csrf: other.csrf })).status).toBe(403); // another session's token
    expect((await out({ csrf: s.csrf, origin: 'https://evil.example' })).status).toBe(403);
    expect((await out({ csrf: s.csrf, headers: { 'sec-fetch-site': 'same-site' } })).status).toBe(403);
    expect((await me(h, s.cookie)).status).toBe(200); // still signed in
    expect((await out({ csrf: s.csrf })).status).toBe(200);
  });

  it('allows the local Vite dev server origin only on localhost', async () => {
    const { sameOrigin } = await import('../src/auth');
    const r = (origin: string) => new Request('http://localhost:8787/api/x', { method: 'POST', headers: { origin } });
    expect(sameOrigin(r('http://localhost:5173'), new URL('http://localhost:8787/api/x'))).toBe(true);
    expect(sameOrigin(new Request(BASE, { method: 'POST', headers: { origin: 'http://localhost:5173' } }), new URL(BASE))).toBe(false);
  });
});

describe('sign-in rate limits', () => {
  it('limits per address (memory + Cloudflare binding layer)', async () => {
    const h = harness(db);
    let last: Response | undefined;
    for (let i = 0; i <= 10; i++) last = await h.call('POST', '/api/auth/sign-in', { body: {}, csrf: CSRF_PRESESSION, ip: '198.51.100.1' });
    expect(last!.status).toBe(429);
    expect(last!.headers.get('retry-after')).toBe('60');
    expect((await h.call('POST', '/api/auth/sign-in', { body: {}, csrf: CSRF_PRESESSION, ip: '198.51.100.2' })).status).toBe(400);
  });

  it('limits per email across addresses', async () => {
    const h = harness(db);
    setupKey(h);
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await h.signIn('buyer@example.com', 'WRONG-KEY-000', { ip: `198.51.100.${10 + i}` })).res.status);
    expect(codes.slice(0, 5).every((c) => c === 401)).toBe(true);
    expect(codes[5]).toBe(429);
  });

  it('strict D1 counter: 10 failed sign-ins per email per address per hour, cleared by success', async () => {
    const h = harness(db);
    setupKey(h);
    const ip = '198.51.100.50';
    for (let i = 0; i < 10; i++) {
      h.clock.now += 61_000; // past the per-minute limits
      expect((await h.signIn('buyer@example.com', 'WRONG-KEY-000', { ip })).res.status).toBe(401);
    }
    h.clock.now += 61_000;
    const blocked = await h.signIn('buyer@example.com', KEY, { ip });
    expect(blocked.res.status).toBe(429);
    expect(blocked.res.headers.get('retry-after')).toBe('3600');
    const row = await db.prepare('SELECT key FROM auth_attempts').first<{ key: string }>();
    expect(row!.key).not.toContain('buyer'); // keyed by an HMAC, not the email
    // someone guessing from another network cannot lock the real customer out
    expect((await h.signIn('buyer@example.com', KEY, { ip: '192.0.2.44' })).res.status).toBe(200);
    h.clock.now += 3_600_000;
    expect((await h.signIn('buyer@example.com', KEY, { ip })).res.status).toBe(200);
    expect((await db.prepare('SELECT count(*) n FROM auth_attempts').first<{ n: number }>())!.n).toBe(0);
  });
});

describe('sign-in edge cases', () => {
  it('signing in again on the same browser replaces its session instead of using another slot', async () => {
    const h = harness(db);
    setupKey(h);
    const first = await h.signIn();
    const second = await h.signIn('buyer@example.com', KEY, { cookie: first.cookie });
    expect((await me(h, first.cookie)).status).toBe(401);
    const body = (await (await me(h, second.cookie)).json()) as any;
    expect(body.sessions).toHaveLength(1);
  });

  it('a deleted account cannot sign in again (generic answer, nothing created)', async () => {
    const h = harness(db);
    setupKey(h);
    await h.signIn();
    await db.prepare('UPDATE users SET deleted_at = 1').run();
    const s = await h.signIn();
    expect(s.res.status).toBe(401);
    expect(s.body.code).toBe('invalid_credentials');
    expect((await db.prepare('SELECT count(*) n FROM sessions WHERE revoked_at IS NULL').first<{ n: number }>())!.n).toBe(1);
  });

  it("when a licence's customer email changes, it moves: the old owner's sessions end and their scheduled work pauses", async () => {
    const h = harness(db);
    const k = setupKey(h, { key: KEY, customerEmail: 'old@example.com' });
    const old = await h.signIn('old@example.com', KEY);
    const oldUser = (await db.prepare("SELECT id FROM users WHERE email = 'old@example.com'").first<{ id: string }>())!.id;
    const now = h.clock.now;
    await db.batch([
      db.prepare("INSERT INTO posts (id, user_id, status, created_at, updated_at) VALUES ('p1', ?, 'scheduled', ?, ?)").bind(oldUser, now, now),
      db.prepare("INSERT INTO post_targets (id, post_id, user_id, platform, mode, status, scheduled_at, created_at, updated_at) VALUES ('t1', 'p1', ?, 'x', 'intent', 'scheduled', ?, ?, ?)").bind(oldUser, now + 1, now, now),
    ]);
    k.customerEmail = 'new@example.com';
    expect((await h.signIn('new@example.com', KEY)).res.status).toBe(200);
    expect((await me(h, old.cookie)).status).toBe(401);
    expect((await db.prepare("SELECT status FROM post_targets WHERE id = 't1'").first<{ status: string }>())!.status).toBe('paused');
  });

  it('sign-in, user and session rows are written together (one batch)', async () => {
    const h = harness(db);
    setupKey(h);
    await h.signIn();
    const counts = await db.batch(['users', 'licences', 'sessions'].map((t) => db.prepare(`SELECT count(*) n FROM ${t}`)));
    expect(counts.map((c) => (c.results[0] as { n: number }).n)).toEqual([1, 1, 1]);
  });
});
