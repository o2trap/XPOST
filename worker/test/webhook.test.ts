import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLAIM_LEASE_MS } from '../src/webhook';
import { harness, lsSign, resetDb, runCron, startDb } from './harness';
import { licence, reminderStatuses, seedUser, targetStatuses } from './fixtures';
import { invoiceEvent, licenceKeyEvent, orderEvent, subscriptionEvent } from './ls-payloads';

let db: D1Database, dispose: () => Promise<void>;
beforeAll(async () => ({ db, dispose } = await startDb()));
afterAll(() => dispose());
beforeEach(() => resetDb(db));

type H = ReturnType<typeof harness>;
async function send(h: H, body: string, sig?: string | null) {
  return h.call('POST', '/api/webhooks/lemonsqueezy', { raw: body, origin: null, headers: sig === null ? {} : { 'x-signature': sig ?? await lsSign(body) } });
}
const result = async (h: H, body: string) => ((await (await send(h, body)).json()) as { result?: string }).result;
const quietErrors = () => vi.spyOn(console, 'error').mockImplementation(() => {});

describe('Lemon Squeezy webhook: security', () => {
  it('rejects missing, malformed and wrong signatures', async () => {
    const h = harness(db);
    const { licenceId } = await seedUser(db, { orderId: 700 });
    const body = orderEvent('order_refunded', { orderId: 700 });
    expect((await send(h, body, null)).status).toBe(401);
    expect((await send(h, body, 'zz')).status).toBe(401);
    expect((await send(h, body, await lsSign(body, 'other-secret'))).status).toBe(401);
    expect((await send(h, body, await lsSign(body + ' '))).status).toBe(401);
    expect((await licence(db, licenceId)).status).toBe('active');
  });

  it('is 503 until the secret and product IDs are configured (fail closed)', async () => {
    for (const extra of [{ LS_WEBHOOK_SECRET: '' }, { LS_PRODUCT_ID: '' }]) {
      expect((await send(harness(db, extra), orderEvent('order_refunded', { orderId: 1 }))).status).toBe(503);
    }
  });

  it('ignores test-mode events unless ALLOW_TEST_WEBHOOKS=true', async () => {
    const { licenceId } = await seedUser(db, { orderId: 710 });
    const body = orderEvent('order_refunded', { orderId: 710, testMode: true });
    expect(await result(harness(db), body)).toBe('ignored: test mode');
    expect((await licence(db, licenceId)).status).toBe('active');
    await resetDb(db);
    const again = await seedUser(db, { orderId: 710 });
    expect(await result(harness(db, { ALLOW_TEST_WEBHOOKS: 'true' }), body)).toMatch(/^refunded: 1 of 1/);
    expect((await licence(db, again.licenceId)).status).toBe('refunded');
  });

  it("ignores XLISTit's events (same store, other product), other stores and partial refunds", async () => {
    const h = harness(db);
    h.fake.subscriptions.set(88, { store_id: 1, order_id: 700, product_id: 20, variant_id: 200, status: 'active' });
    const { licenceId } = await seedUser(db, { orderId: 700 });
    const cases: [string, string][] = [
      [orderEvent('order_refunded', { orderId: 700, productId: 20 }), 'ignored: other product'],
      [subscriptionEvent('subscription_expired', { subscriptionId: 88, orderId: 700, status: 'expired', productId: 20 }), 'ignored: other product'],
      [invoiceEvent('subscription_payment_refunded', { invoiceId: 1, subscriptionId: 88, refunded: true, refundedAmount: 999 }), 'ignored: other product'],
      [orderEvent('order_refunded', { orderId: 700, storeId: 42 }), 'ignored: other store'],
      [orderEvent('order_refunded', { orderId: 700, status: 'partial_refund', refunded: false }), 'ignored: partial refund'],
      [orderEvent('order_created', { orderId: 700, status: 'paid' }), 'ignored: order_created'],
    ];
    for (const [body, expected] of cases) expect(await result(h, body)).toBe(expected);
    expect((await licence(db, licenceId)).status).toBe('active');
    expect(h.fake.calls.filter((c) => c.startsWith('PATCH'))).toEqual([]);
  });
});

describe('Lemon Squeezy webhook: refunds', () => {
  it('a full refund marks the licence refunded, pauses scheduled targets and reminders, keeps sessions, and disables the LS key', async () => {
    const h = harness(db);
    h.fake.addKey({ key: 'REFUND-KEY-01', orderId: 700, status: 'active' });
    const { userId, licenceId } = await seedUser(db, { orderId: 700 });
    await db.prepare("INSERT INTO sessions (id, token_hash, user_id, licence_id, kind, created_at, last_seen_at, expires_at) VALUES ('s1', 'h1', ?, ?, 'web', 0, 0, 9e15)").bind(userId, licenceId).run();
    expect(await result(h, orderEvent('order_refunded', { orderId: 700 }))).toBe('refunded: 1 of 1 licence(s) changed');
    expect((await licence(db, licenceId)).status).toBe('refunded');
    expect(await targetStatuses(db, userId)).toEqual({ tiktok: 'paused', x: 'paused', youtube: 'confirmed' });
    expect(await reminderStatuses(db, userId)).toEqual(['paused', 'sent']);
    expect((await db.prepare('SELECT revoked_at FROM sessions').first<{ revoked_at: number | null }>())!.revoked_at).toBeNull();
    expect([...h.fake.keys.values()][0]!.status).toBe('disabled');
    expect((await db.prepare('SELECT ls_disabled_at FROM refunded_orders WHERE ls_order_id = 700').first<{ ls_disabled_at: number }>())!.ls_disabled_at).toBe(h.clock.now);
  });

  it('a refund before anyone signed in still disables the key, and a later sign-in is refused as refunded', async () => {
    const h = harness(db);
    const k = h.fake.addKey({ key: 'EARLY-REFUND-01', orderId: 720, status: 'inactive' });
    expect(await result(h, orderEvent('order_refunded', { orderId: 720 }))).toBe('refunded: no licence yet');
    expect(k.status).toBe('disabled');
    const s = await h.signIn('buyer@example.com', 'EARLY-REFUND-01');
    expect(s.res.status).toBe(403);
    expect(s.body.code).toBe('refunded');
    // even if LS still said the key was fine (e.g. no LS_API_KEY), xpost's record decides
    k.status = 'active';
    expect((await h.signIn('buyer@example.com', 'EARLY-REFUND-01')).body.code).toBe('refunded');
  });

  it('a failed LS disable is not marked processed: the retry disables it; the cron also retries', async () => {
    const h = harness(db);
    const k = h.fake.addKey({ key: 'RETRY-KEY-01', orderId: 730, status: 'active' });
    const body = orderEvent('order_refunded', { orderId: 730 });
    h.fake.disableFails = 503;
    const spy = quietErrors();
    expect((await send(h, body)).status).toBe(500);
    expect((await db.prepare('SELECT processed_at FROM webhook_events').first<{ processed_at: number | null }>())!.processed_at).toBeNull();
    expect(k.status).toBe('active');
    // LS retries the same delivery
    h.fake.disableFails = null;
    expect(await result(h, body)).toMatch(/^refunded/);
    expect(k.status).toBe('disabled');
    expect(await result(h, body)).toBe('duplicate');

    // a refund whose disable keeps failing is picked up by the cron later
    const k2 = h.fake.addKey({ key: 'RETRY-KEY-02', orderId: 731, status: 'active' });
    h.fake.disableFails = 503;
    await send(h, orderEvent('order_refunded', { orderId: 731 }));
    h.fake.disableFails = null;
    await runCron(h);
    spy.mockRestore();
    expect(k2.status).toBe('disabled');
  });

  it('the user sees why in /api/me after a refund', async () => {
    const h = harness(db);
    h.fake.addKey({ key: 'XPOST-KEY-0001', orderId: 703 });
    const s = await h.signIn();
    await send(h, orderEvent('order_refunded', { orderId: 703 }));
    const me = (await (await h.call('GET', '/api/me', { cookie: s.cookie })).json()) as any;
    expect(me.licence).toMatchObject({ status: 'refunded', reason: 'refunded', canPost: false });
    expect(me.licence.message).toMatch(/refunded/);
  });
});

describe('Lemon Squeezy webhook: idempotency and ordering', () => {
  it('a replayed delivery is not processed twice', async () => {
    const h = harness(db);
    const { licenceId } = await seedUser(db, { orderId: 700 });
    const body = orderEvent('order_refunded', { orderId: 700 });
    expect(await result(h, body)).toMatch(/^refunded/);
    await db.prepare("UPDATE licences SET status = 'active' WHERE id = ?").bind(licenceId).run(); // fixed by hand
    const again = await send(h, body);
    expect(await again.json()).toEqual({ ok: true, result: 'duplicate' });
    expect((await licence(db, licenceId)).status).toBe('active');
    expect((await db.prepare('SELECT count(*) n FROM webhook_events').first<{ n: number }>())!.n).toBe(1);
  });

  it('claims deliveries atomically: one in flight gets 409 (LS retries), an abandoned claim can be re-taken', async () => {
    const h = harness(db);
    const { licenceId } = await seedUser(db, { orderId: 740 });
    const body = orderEvent('order_refunded', { orderId: 740 });
    // simulate another request that claimed it a moment ago and is still running
    await db.prepare("INSERT INTO webhook_events (event_key, name, received_at) VALUES (?, 'order_refunded', ?)")
      .bind([...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body)))].map((b) => b.toString(16).padStart(2, '0')).join(''), h.clock.now - 1000).run();
    expect((await send(h, body)).status).toBe(409);
    expect((await licence(db, licenceId)).status).toBe('active');
    h.clock.now += CLAIM_LEASE_MS;
    expect(await result(h, body)).toMatch(/^refunded/);
  });

  it('ignores an event older than one already applied (out-of-order retries)', async () => {
    const h = harness(db);
    const { licenceId } = await seedUser(db, { orderId: 750 });
    const newer = subscriptionEvent('subscription_updated', { subscriptionId: 75, orderId: 750, status: 'active', updatedAt: '2026-11-14T12:00:00.000000Z' });
    const older = subscriptionEvent('subscription_paused', { subscriptionId: 75, orderId: 750, status: 'paused', updatedAt: '2026-11-14T11:00:00.000000Z' });
    await send(h, newer);
    expect(await result(h, older)).toBe('ignored: stale subscription_paused');
    expect((await licence(db, licenceId)).status).toBe('active');
    // the same timestamp is not stale (LS sends subscription_updated alongside the specific event)
    const same = subscriptionEvent('subscription_cancelled', { subscriptionId: 75, orderId: 750, status: 'cancelled', updatedAt: '2026-11-14T12:00:00.000000Z' });
    expect(await result(h, same)).toMatch(/1 of 1/);
  });
});

describe('Lemon Squeezy webhook: subscriptions and invoices', () => {
  it('maps subscription_updated statuses (active, on_trial, paused, past_due, unpaid, cancelled, expired)', async () => {
    const h = harness(db);
    const { userId, licenceId } = await seedUser(db, { orderId: 760 });
    const steps: [string, string, string | null, string][] = [
      ['past_due', 'active', 'payment_failed', 'scheduled'],
      ['unpaid', 'inactive', 'unpaid', 'paused'],
      ['active', 'active', null, 'scheduled'],
      ['paused', 'inactive', 'subscription_paused', 'paused'],
      ['on_trial', 'active', null, 'scheduled'],
      ['cancelled', 'active', 'cancelled', 'scheduled'],
      ['expired', 'expired', 'expired', 'paused'],
    ];
    let minute = 0;
    for (const [subStatus, status, reason, target] of steps) {
      const at = new Date(Date.UTC(2026, 10, 14, 10, ++minute)).toISOString();
      await send(h, subscriptionEvent('subscription_updated', { subscriptionId: 76, orderId: 760, status: subStatus, updatedAt: at }));
      expect(await licence(db, licenceId), subStatus).toMatchObject({ status, status_reason: reason });
      expect((await targetStatuses(db, userId)).x, subStatus).toBe(target);
    }
  });

  it('pause/resume events round-trip and restore scheduled work and reminders', async () => {
    const h = harness(db);
    const { userId, licenceId } = await seedUser(db, { orderId: 701 });
    await send(h, subscriptionEvent('subscription_paused', { subscriptionId: 70, orderId: 701, status: 'paused', updatedAt: '2026-11-14T10:00:00.000000Z' }));
    expect(await licence(db, licenceId)).toMatchObject({ status: 'inactive', status_reason: 'subscription_paused' });
    await send(h, subscriptionEvent('subscription_resumed', { subscriptionId: 70, orderId: 701, status: 'active', updatedAt: '2026-11-14T10:05:00.000000Z' }));
    expect(await licence(db, licenceId)).toMatchObject({ status: 'active', status_reason: null });
    expect(await targetStatuses(db, userId)).toEqual({ tiktok: 'scheduled', x: 'scheduled', youtube: 'confirmed' });
    expect(await reminderStatuses(db, userId)).toEqual(['pending', 'sent']);
  });

  it('invoice events are mapped through the subscription seen earlier (no product on invoices)', async () => {
    const h = harness(db);
    const { licenceId } = await seedUser(db, { orderId: 702 });
    await send(h, subscriptionEvent('subscription_created', { subscriptionId: 72, orderId: 702, status: 'active', updatedAt: '2026-11-14T09:00:00.000000Z' }));
    await send(h, invoiceEvent('subscription_payment_failed', { invoiceId: 901, subscriptionId: 72, status: 'failed', updatedAt: '2026-11-14T10:00:00.000000Z' }));
    expect(await licence(db, licenceId)).toMatchObject({ status: 'active', status_reason: 'payment_failed' });
    await send(h, invoiceEvent('subscription_payment_recovered', { invoiceId: 901, subscriptionId: 72, status: 'paid', updatedAt: '2026-11-14T11:00:00.000000Z' }));
    expect(await licence(db, licenceId)).toMatchObject({ status: 'active', status_reason: null });
    expect(h.fake.calls).toEqual([]); // no LS lookup needed
  });

  it('an unknown subscription is looked up once in LS and remembered; a full payment refund blocks, a partial one does not', async () => {
    const h = harness(db);
    h.fake.subscriptions.set(73, { store_id: 1, order_id: 703, product_id: 10, variant_id: 100, status: 'active' });
    const { userId, licenceId } = await seedUser(db, { orderId: 703 });
    expect(await result(h, invoiceEvent('subscription_payment_refunded', { invoiceId: 902, subscriptionId: 73, refunded: true, refundedAmount: 100, updatedAt: '2026-11-14T10:00:00.000000Z' }))).toMatch(/0 of 1/);
    expect(await result(h, invoiceEvent('subscription_payment_refunded', { invoiceId: 903, subscriptionId: 73, refunded: true, refundedAmount: 999 }))).toMatch(/1 of 1/);
    expect(await licence(db, licenceId)).toMatchObject({ status: 'inactive', status_reason: 'payment_refunded' });
    expect((await targetStatuses(db, userId)).x).toBe('paused');
    expect(h.fake.calls).toEqual(['GET /v1/subscriptions/73']);
    await send(h, invoiceEvent('subscription_payment_success', { invoiceId: 904, subscriptionId: 73 }));
    expect(await licence(db, licenceId)).toMatchObject({ status: 'active', status_reason: null });
    expect((await targetStatuses(db, userId)).x).toBe('scheduled');
  });

  it('a refunded licence is never revived by subscription or invoice events', async () => {
    const h = harness(db);
    const { licenceId } = await seedUser(db, { orderId: 704, status: 'refunded', reason: 'refunded' });
    await send(h, subscriptionEvent('subscription_updated', { subscriptionId: 74, orderId: 704, status: 'active' }));
    await send(h, invoiceEvent('subscription_payment_success', { invoiceId: 905, subscriptionId: 74 }));
    expect((await licence(db, licenceId)).status).toBe('refunded');
  });

  it('license_key_updated applies the key status (disabled blocks, re-enabled resumes)', async () => {
    const h = harness(db);
    const { userId, licenceId } = await seedUser(db, { lsKeyId: 4242 });
    await send(h, licenceKeyEvent('license_key_updated', { keyId: 4242, status: 'disabled', disabled: true, updatedAt: '2026-11-14T10:00:00.000000Z' }));
    expect(await licence(db, licenceId)).toMatchObject({ status: 'disabled', ls_key_status: 'disabled' });
    expect(await targetStatuses(db, userId)).toMatchObject({ x: 'paused' });
    await send(h, licenceKeyEvent('license_key_updated', { keyId: 4242, status: 'active', expiresAt: '2027-01-01T00:00:00.000000Z', updatedAt: '2026-11-14T11:00:00.000000Z' }));
    expect(await licence(db, licenceId)).toMatchObject({ status: 'active', expires_at: Date.UTC(2027, 0, 1) });
    expect(await targetStatuses(db, userId)).toMatchObject({ x: 'scheduled' });
  });

  it('webhooks are exempt from CSRF and per-address limits (signed server-to-server)', async () => {
    const h = harness(db);
    for (let i = 0; i < 130; i++) expect((await send(h, orderEvent('order_created', { orderId: 10_000 + i, status: 'paid' }))).status).toBe(200);
  });
});
