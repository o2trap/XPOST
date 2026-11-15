import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { harness, lsSign, resetDb, startDb } from './harness';
import { licence, reminderStatuses, seedUser, targetStatuses } from './fixtures';

let db: D1Database, dispose: () => Promise<void>;
beforeAll(async () => ({ db, dispose } = await startDb()));
afterAll(() => dispose());
beforeEach(() => resetDb(db));

const order = (name: string, orderId: number, o: { status?: string; storeId?: number; productId?: number } = {}) => JSON.stringify({
  meta: { event_name: name },
  data: { type: 'orders', id: String(orderId), attributes: { store_id: o.storeId ?? 1, status: o.status ?? 'refunded', first_order_item: { product_id: o.productId ?? 10, variant_id: 100 } } },
});
const sub = (name: string, orderId: number, o: { productId?: number } = {}) => JSON.stringify({
  meta: { event_name: name },
  data: { type: 'subscriptions', id: '77', attributes: { store_id: 1, order_id: orderId, product_id: o.productId ?? 10, variant_id: 100, status: 'active' } },
});
const keyEvent = (name: string, keyId: number, attrs: Record<string, unknown>) => JSON.stringify({
  meta: { event_name: name }, data: { type: 'license-keys', id: String(keyId), attributes: { store_id: 1, product_id: 10, order_id: 1, ...attrs } },
});

async function send(h: ReturnType<typeof harness>, body: string, sig?: string | null) {
  return h.call('POST', '/api/webhooks/lemonsqueezy', { raw: body, origin: null, headers: sig === null ? {} : { 'x-signature': sig ?? await lsSign(body) } });
}

describe('Lemon Squeezy webhook', () => {
  it('rejects missing, malformed and wrong signatures', async () => {
    const h = harness(db);
    const { licenceId } = await seedUser(db, { orderId: 700 });
    const body = order('order_refunded', 700);
    expect((await send(h, body, null)).status).toBe(401);
    expect((await send(h, body, 'zz')).status).toBe(401);
    expect((await send(h, body, await lsSign(body, 'other-secret'))).status).toBe(401);
    expect((await send(h, body, await lsSign(body + ' '))).status).toBe(401);
    expect((await licence(db, licenceId)).status).toBe('active');
  });

  it('is 503 until the secret and product IDs are configured (fail closed)', async () => {
    for (const extra of [{ LS_WEBHOOK_SECRET: '' }, { LS_PRODUCT_ID: '' }]) {
      const h = harness(db, extra);
      const body = order('order_refunded', 1);
      expect((await send(h, body)).status).toBe(503);
    }
  });

  it('a full refund marks the licence refunded, pauses scheduled targets and reminders, keeps sessions, and disables the LS key', async () => {
    const h = harness(db);
    h.fake.addKey({ key: 'REFUND-KEY-01', orderId: 700, status: 'active' });
    const { userId, licenceId } = await seedUser(db, { orderId: 700 });
    await db.prepare("INSERT INTO sessions (id, token_hash, user_id, licence_id, kind, created_at, last_seen_at, expires_at) VALUES ('s1', 'h1', ?, ?, 'web', 0, 0, 9e15)").bind(userId, licenceId).run();
    const res = await send(h, order('order_refunded', 700));
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).result).toMatch(/^refunded/);
    const l = await licence(db, licenceId);
    expect(l.status).toBe('refunded');
    expect(await targetStatuses(db, userId)).toEqual({ tiktok: 'paused', x: 'paused', youtube: 'confirmed' });
    expect(await reminderStatuses(db, userId)).toEqual(['paused', 'sent']);
    expect((await db.prepare('SELECT revoked_at FROM sessions').first<{ revoked_at: number | null }>())!.revoked_at).toBeNull();
    expect([...h.fake.keys.values()][0]!.status).toBe('disabled');
  });

  it('is idempotent: a replayed delivery is not processed twice', async () => {
    const h = harness(db);
    const { licenceId } = await seedUser(db, { orderId: 700 });
    const body = order('order_refunded', 700);
    expect(((await (await send(h, body)).json()) as any).result).toMatch(/^refunded/);
    // someone fixes the licence by hand; the replay must not undo it
    await db.prepare("UPDATE licences SET status = 'active' WHERE id = ?").bind(licenceId).run();
    const again = await send(h, body);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ ok: true, result: 'duplicate' });
    expect((await licence(db, licenceId)).status).toBe('active');
    expect((await db.prepare('SELECT count(*) n FROM webhook_events').first<{ n: number }>())!.n).toBe(1);
  });

  it("ignores XLISTit's events (same store, other product), other stores and partial refunds", async () => {
    const h = harness(db);
    const { licenceId } = await seedUser(db, { orderId: 700 });
    const cases: [string, string][] = [
      [order('order_refunded', 700, { productId: 20 }), 'ignored: other product'],
      [sub('subscription_expired', 700, { productId: 20 }), 'ignored: other product'],
      [order('order_refunded', 700, { storeId: 42 }), 'ignored: other store'],
      [order('order_refunded', 700, { status: 'partial_refund' }), 'ignored: partial refund'],
      [sub('subscription_created', 700), 'ignored: subscription_created'],
    ];
    for (const [body, result] of cases) expect(await (await send(h, body)).json()).toEqual({ ok: true, result });
    expect((await licence(db, licenceId)).status).toBe('active');
  });

  it('subscription expiry blocks; pause/resume round-trips and restores scheduled work', async () => {
    const h = harness(db);
    const { userId, licenceId } = await seedUser(db, { orderId: 701 });
    await send(h, sub('subscription_paused', 701));
    expect(await licence(db, licenceId)).toMatchObject({ status: 'inactive', status_reason: 'subscription_paused' });
    expect(await targetStatuses(db, userId)).toMatchObject({ x: 'paused', tiktok: 'paused' });
    await send(h, sub('subscription_resumed', 701));
    expect(await licence(db, licenceId)).toMatchObject({ status: 'active', status_reason: null });
    expect(await targetStatuses(db, userId)).toEqual({ tiktok: 'scheduled', x: 'scheduled', youtube: 'confirmed' });
    expect(await reminderStatuses(db, userId)).toEqual(['pending', 'sent']);
    await send(h, sub('subscription_expired', 701));
    expect(await licence(db, licenceId)).toMatchObject({ status: 'expired' });
    expect(await targetStatuses(db, userId)).toMatchObject({ x: 'paused' });
  });

  it('payment failure and cancellation are warnings, not blocks', async () => {
    const h = harness(db);
    const { userId, licenceId } = await seedUser(db, { orderId: 702 });
    await send(h, sub('subscription_payment_failed', 702));
    expect(await licence(db, licenceId)).toMatchObject({ status: 'active', status_reason: 'payment_failed' });
    expect(await targetStatuses(db, userId)).toMatchObject({ x: 'scheduled' });
    await send(h, sub('subscription_payment_recovered', 702));
    expect(await licence(db, licenceId)).toMatchObject({ status: 'active', status_reason: null });
    await send(h, sub('subscription_cancelled', 702));
    expect(await licence(db, licenceId)).toMatchObject({ status: 'active', status_reason: 'cancelled' });
  });

  it('license_key_updated applies the key status (disabled blocks, re-enabled resumes)', async () => {
    const h = harness(db);
    const { userId, licenceId } = await seedUser(db, { lsKeyId: 4242 });
    await send(h, keyEvent('license_key_updated', 4242, { status: 'disabled', disabled: true }));
    expect(await licence(db, licenceId)).toMatchObject({ status: 'disabled', ls_key_status: 'disabled' });
    expect(await targetStatuses(db, userId)).toMatchObject({ x: 'paused' });
    await send(h, keyEvent('license_key_updated', 4242, { status: 'active', disabled: false, expires_at: '2027-01-01T00:00:00.000000Z' }));
    expect(await licence(db, licenceId)).toMatchObject({ status: 'active', expires_at: Date.UTC(2027, 0, 1) });
    expect(await targetStatuses(db, userId)).toMatchObject({ x: 'scheduled' });
  });

  it('the user sees why in /api/me after a refund', async () => {
    const h = harness(db);
    h.fake.addKey({ key: 'XPOST-KEY-0001', orderId: 703 });
    const s = await h.signIn();
    await send(h, order('order_refunded', 703));
    const me = (await (await h.call('GET', '/api/me', { cookie: s.cookie })).json()) as any;
    expect(me.licence).toMatchObject({ status: 'refunded', reason: 'refunded', canPost: false });
    expect(me.licence.message).toMatch(/refunded/);
  });

  it('webhooks are exempt from CSRF and per-address limits (signed server-to-server)', async () => {
    const h = harness(db);
    for (let i = 0; i < 130; i++) {
      const body = order('order_refunded', 10_000 + i);
      const res = await send(h, body);
      expect(res.status).toBe(200);
    }
  });
});
