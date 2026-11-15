/** Seed rows for webhook/cron tests: a user, a licence, a post with scheduled targets and pending reminders. */
import { T0 } from './harness';

let n = 0;
const id = () => (++n).toString(16).padStart(32, '0');

export async function seedUser(db: D1Database, o: { email?: string; lsKeyId?: number; orderId?: number; productId?: number; status?: string; reason?: string | null; validatedAt?: number; expiresAt?: number | null } = {}) {
  const userId = id(), licenceId = id(), postId = id(), t1 = id(), t2 = id(), t3 = id();
  const now = T0;
  await db.batch([
    db.prepare('INSERT INTO users (id, email, created_at, updated_at) VALUES (?, ?, ?, ?)').bind(userId, o.email ?? `u${n}@example.com`, now, now),
    db.prepare(`INSERT INTO licences (id, user_id, ls_license_key_hash, key_last4, ls_license_key_id, ls_store_id, ls_product_id, ls_variant_id,
      ls_order_id, ls_customer_email, status, status_reason, expires_at, last_validated_at, created_at, updated_at)
      VALUES (?, ?, ?, 'AB12', ?, 1, ?, 100, ?, 'x@example.com', ?, ?, ?, ?, ?, ?)`)
      .bind(licenceId, userId, id() + id(), o.lsKeyId ?? n, o.productId ?? 10, o.orderId ?? 500, o.status ?? 'active', o.reason ?? null, o.expiresAt ?? null, o.validatedAt ?? now, now, now),
    db.prepare("INSERT INTO posts (id, user_id, caption, status, created_at, updated_at) VALUES (?, ?, 'secret caption', 'scheduled', ?, ?)").bind(postId, userId, now, now),
    db.prepare("INSERT INTO post_targets (id, post_id, user_id, platform, mode, status, scheduled_at, created_at, updated_at) VALUES (?, ?, ?, 'x', 'intent', 'scheduled', ?, ?, ?)").bind(t1, postId, userId, now + 3_600_000, now, now),
    db.prepare("INSERT INTO post_targets (id, post_id, user_id, platform, mode, status, scheduled_at, created_at, updated_at) VALUES (?, ?, ?, 'tiktok', 'handoff', 'scheduled', ?, ?, ?)").bind(t2, postId, userId, now + 3_600_000, now, now),
    db.prepare("INSERT INTO post_targets (id, post_id, user_id, platform, mode, status, confirmed_at, created_at, updated_at) VALUES (?, ?, ?, 'youtube', 'handoff', 'confirmed', ?, ?, ?)").bind(t3, postId, userId, now, now, now),
    db.prepare("INSERT INTO reminders (id, target_id, user_id, channel, due_at, status, created_at, updated_at) VALUES (?, ?, ?, 'push', ?, 'pending', ?, ?)").bind(id(), t1, userId, now + 3_600_000, now, now),
    db.prepare("INSERT INTO reminders (id, target_id, user_id, channel, due_at, status, created_at, updated_at) VALUES (?, ?, ?, 'push', ?, 'sent', ?, ?)").bind(id(), t3, userId, now, now, now),
  ]);
  return { userId, licenceId };
}

export async function targetStatuses(db: D1Database, userId: string) {
  const r = await db.prepare('SELECT platform, status FROM post_targets WHERE user_id = ? ORDER BY platform').bind(userId).all<{ platform: string; status: string }>();
  return Object.fromEntries(r.results.map((x) => [x.platform, x.status]));
}
export async function reminderStatuses(db: D1Database, userId: string) {
  const r = await db.prepare('SELECT status FROM reminders WHERE user_id = ? ORDER BY status').bind(userId).all<{ status: string }>();
  return r.results.map((x) => x.status);
}
export async function licence(db: D1Database, licenceId: string) {
  return (await db.prepare('SELECT * FROM licences WHERE id = ?').bind(licenceId).first<Record<string, any>>())!;
}
