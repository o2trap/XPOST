import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DAY, T0, harness, resetDb, startDb } from './harness';
import { licence, seedUser, targetStatuses } from './fixtures';

let db: D1Database, dispose: () => Promise<void>;
beforeAll(async () => ({ db, dispose } = await startDb()));
afterAll(() => dispose());
beforeEach(() => resetDb(db));

async function runCron(h: ReturnType<typeof harness>) {
  const waits: Promise<unknown>[] = [];
  await h.app.scheduled({ cron: '*/15 * * * *', scheduledTime: h.clock.now, noRetry() {} } as ScheduledController, h.env,
    { waitUntil: (p: Promise<unknown>) => waits.push(p), passThroughOnException() {} } as unknown as ExecutionContext);
  await Promise.all(waits);
}

describe('cron licence re-validation', () => {
  it('re-checks only stale licences, applies LS status and pauses blocked users', async () => {
    const h = harness(db);
    h.clock.now = T0 + 2 * DAY;
    const fresh = await seedUser(db, { validatedAt: h.clock.now - 3_600_000 });
    const stale = await seedUser(db, { validatedAt: T0 });
    h.fake.addKey({ key: 'K-STALE' });
    // make LS key IDs match the seeded licences
    const staleRow = await licence(db, stale.licenceId);
    const freshRow = await licence(db, fresh.licenceId);
    const keys = [...h.fake.keys.values()];
    keys[0]!.id = staleRow.ls_license_key_id;
    keys[0]!.status = 'expired';
    await runCron(h);
    expect(h.fake.calls).toEqual([`GET /v1/license-keys/${staleRow.ls_license_key_id}`]);
    expect(await licence(db, stale.licenceId)).toMatchObject({ status: 'expired', last_validated_at: h.clock.now });
    expect(await targetStatuses(db, stale.userId)).toMatchObject({ x: 'paused', tiktok: 'paused' });
    expect(await licence(db, fresh.licenceId)).toMatchObject({ status: 'active', last_validated_at: freshRow.last_validated_at });
  });

  it('a renewed licence becomes active again and its scheduled work resumes', async () => {
    const h = harness(db);
    h.clock.now = T0 + 2 * DAY;
    const u = await seedUser(db, { validatedAt: T0, status: 'expired', reason: 'expired' });
    await db.prepare("UPDATE post_targets SET status = 'paused', paused_from = 'scheduled' WHERE user_id = ? AND status = 'scheduled'").bind(u.userId).run();
    const k = h.fake.addKey({ key: 'K-RENEWED', status: 'active' });
    k.id = (await licence(db, u.licenceId)).ls_license_key_id;
    await runCron(h);
    expect(await licence(db, u.licenceId)).toMatchObject({ status: 'active', status_reason: null });
    expect(await targetStatuses(db, u.userId)).toMatchObject({ x: 'scheduled', tiktok: 'scheduled' });
  });

  it('a key LS no longer knows is disabled; refunded licences are never re-checked', async () => {
    const h = harness(db);
    h.clock.now = T0 + 2 * DAY;
    const gone = await seedUser(db, { validatedAt: T0, lsKeyId: 999_999 });
    const refunded = await seedUser(db, { validatedAt: T0, status: 'refunded', reason: 'refunded' });
    await runCron(h);
    expect(await licence(db, gone.licenceId)).toMatchObject({ status: 'disabled', status_reason: 'not_found' });
    expect(h.fake.calls).toEqual(['GET /v1/license-keys/999999']);
    expect((await licence(db, refunded.licenceId)).status).toBe('refunded');
  });

  it('takes at most REVALIDATE_BATCH licences per run (Free plan subrequest budget), oldest first', async () => {
    const h = harness(db, { REVALIDATE_BATCH: '3' });
    h.clock.now = T0 + 2 * DAY;
    for (let i = 0; i < 5; i++) await seedUser(db, { validatedAt: T0 + i });
    await runCron(h);
    expect(h.fake.calls).toHaveLength(3);
    expect((await db.prepare('SELECT count(*) n FROM licences WHERE last_validated_at = ?').bind(h.clock.now).first<{ n: number }>())!.n).toBe(3);
  });

  it('stops the run when Lemon Squeezy is failing, leaving licences unchanged for the next run', async () => {
    const h = harness(db);
    h.clock.now = T0 + 2 * DAY;
    const u = await seedUser(db, { validatedAt: T0 });
    await seedUser(db, { validatedAt: T0 + 1 });
    h.fake.down = 503;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await runCron(h);
    spy.mockRestore();
    expect(h.fake.calls).toHaveLength(1);
    expect(await licence(db, u.licenceId)).toMatchObject({ status: 'active', last_validated_at: T0 });
  });

  it('does nothing without LS_API_KEY or product IDs', async () => {
    for (const extra of [{ LS_API_KEY: '' }, { LS_PRODUCT_ID: '' }]) {
      const h = harness(db, extra);
      h.clock.now = T0 + 2 * DAY;
      await seedUser(db, { validatedAt: T0 });
      await runCron(h);
      expect(h.fake.calls).toEqual([]);
    }
  });
});
