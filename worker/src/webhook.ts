/**
 * Lemon Squeezy webhook: POST /api/webhooks/lemonsqueezy.
 * verifyWebhookSignature is forked from XLISTit website/lib/webhook.ts (hex HMAC-SHA256 of the raw body, checked
 * with Web Crypto's constant-time verify), and so is the refund handling (a full refund disables the order's licence
 * keys in Lemon Squeezy). xpost changes (Step 0 "fix, don't copy" list):
 * - the store check is mandatory, and the product (and variant, if configured) must be xpost's: the store is shared
 *   with XLISTit, whose events are acknowledged and ignored;
 * - test-mode events are ignored unless ALLOW_TEST_WEBHOOKS=true;
 * - each delivery is claimed atomically in webhook_events (key = SHA-256 of the raw body; LS sends no event ID) and
 *   marked processed only after every side effect, including the LS key disable, has succeeded; otherwise the
 *   response is 500 and LS's retry runs it again (every step is idempotent);
 * - out-of-order deliveries are ignored when the object's updated_at is older than one already applied;
 * - full refunds are recorded per order (refunded_orders) even when nobody has signed in with that key yet, so a
 *   later sign-in is refused;
 * - subscription events map attributes.status; subscription invoice events (subscription_payment_*), which carry
 *   only subscription_id, are mapped to the order through ls_subscriptions (or one LS API lookup);
 * - D1 is the source of truth: events change licences.status and pause/resume the owner's scheduled targets and
 *   reminders (pause.ts). Sessions are kept so the user can read why in the app.
 */
import type { LicenceStatus } from '@xpost/shared';
import type { Ctx } from './app';
import { licenceConfigured } from './config';
import { sha256Hex } from './crypto';
import { json } from './http';
import { SUBSCRIPTION_BLOCK_REASONS, deriveStatus, isXpostProduct, parseTime } from './licence';
import { logError, logInfo } from './log';
import { syncPauseStatements } from './pause';

/** Forked from XLISTit verifyWebhookSignature. Web Crypto's verify is constant-time. */
export async function verifyWebhookSignature(rawBody: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const sig = Uint8Array.from(signature.match(/../g)!.map((h) => parseInt(h, 16)));
  return crypto.subtle.verify('HMAC', key, sig, enc.encode(rawBody));
}

interface Attrs {
  store_id?: number; product_id?: number; variant_id?: number; order_id?: number; subscription_id?: number; status?: string;
  disabled?: boolean | number; expires_at?: string | null; updated_at?: string; test_mode?: boolean; refunded?: boolean;
  total?: number; refunded_amount?: number; first_order_item?: { product_id?: number; variant_id?: number };
}
export interface WebhookEvent { meta?: { event_name?: string; test_mode?: boolean }; data?: { id?: string; type?: string; attributes?: Attrs } }

interface LicenceRef { id: string; user_id: string; status: LicenceStatus; status_reason: string | null; expires_at: number | null }
type Next = { status: LicenceStatus; reason: string | null; expiresAt?: number | null; lsKeyStatus?: string } | null;

interface Plan { result: string; statements: D1PreparedStatement[]; disableOrderId?: number }

const MAX_BODY = 256 * 1024;
/** A claimed delivery that never finished (Worker crashed) can be claimed again after this long. */
export const CLAIM_LEASE_MS = 60_000;
/** After this many failed LS disable attempts for a refunded order, the cron stops retrying it (and it is logged). */
export const MAX_DISABLE_ATTEMPTS = 20;

export async function handleWebhook(ctx: Ctx, req: Request): Promise<Response> {
  const { cfg, db, now } = ctx;
  // Fail closed until configured. 503 makes LS retry a few times; set the secret and IDs, then resend from LS.
  if (!cfg.LS_WEBHOOK_SECRET || !licenceConfigured(cfg)) return json({ ok: false, error: 'webhook not configured' }, 503);
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ ok: false }, 413);
  if (!(await verifyWebhookSignature(raw, req.headers.get('x-signature'), cfg.LS_WEBHOOK_SECRET))) return json({ ok: false }, 401);
  let event: WebhookEvent;
  try { event = JSON.parse(raw) as WebhookEvent; } catch { return json({ ok: false }, 400); }
  const name = String(event.meta?.event_name ?? req.headers.get('x-event-name') ?? 'unknown').slice(0, 60);
  const eventKey = await sha256Hex(raw);

  // Atomic claim: a new delivery, or one whose earlier attempt failed or was abandoned (lease expired).
  const claimed = await db.prepare(
    `INSERT INTO webhook_events (event_key, name, received_at) VALUES (?1, ?2, ?3)
     ON CONFLICT (event_key) DO UPDATE SET received_at = excluded.received_at
       WHERE webhook_events.processed_at IS NULL AND webhook_events.received_at < ?4
     RETURNING event_key`,
  ).bind(eventKey, name, now, now - CLAIM_LEASE_MS).first();
  if (!claimed) {
    const row = await db.prepare('SELECT processed_at FROM webhook_events WHERE event_key = ?').bind(eventKey).first<{ processed_at: number | null }>();
    if (row?.processed_at) return json({ ok: true, result: 'duplicate' });
    return json({ ok: false, error: 'in progress' }, 409); // another request is handling it; LS retries later
  }

  try {
    const testMode = event.meta?.test_mode === true || event.data?.attributes?.test_mode === true;
    const plan: Plan = testMode && cfg.ALLOW_TEST_WEBHOOKS !== true ? { result: 'ignored: test mode', statements: [] } : await planEvent(ctx, event, name);
    if (plan.statements.length) await db.batch(plan.statements);
    if (plan.disableOrderId !== undefined) await disableRefundedOrder(ctx, plan.disableOrderId);
    await db.prepare('UPDATE webhook_events SET processed_at = ?, result = ? WHERE event_key = ?').bind(now, plan.result.slice(0, 200), eventKey).run();
    logInfo(`webhook ${name}: ${plan.result}`);
    return json({ ok: true, result: plan.result });
  } catch (e) {
    logError('webhook failed', name, e);
    // Release the claim so LS's retry (non-2xx) can run it again straight away.
    await db.prepare('UPDATE webhook_events SET received_at = 0 WHERE event_key = ? AND processed_at IS NULL').bind(eventKey).run().catch(() => undefined);
    return json({ ok: false }, 500);
  }
}

/**
 * XLISTit behaviour, kept: a fully refunded order's licence keys are disabled in Lemon Squeezy (needs LS_API_KEY),
 * so they also stop working for anything else that checks them. Throws on failure so the webhook is retried; the
 * cron also retries orders whose ls_disabled_at is still null.
 */
export async function disableRefundedOrder(ctx: Ctx, orderId: number): Promise<boolean> {
  const { db, now, ls } = ctx;
  if (!ls.hasApiKey) { logError('refund: LS_API_KEY not set, licence keys not disabled in Lemon Squeezy'); return false; }
  try {
    const keys = await ls.licenceKeysForOrder(orderId);
    for (const k of keys) if (k.attributes.status !== 'disabled') await ls.disableLicenceKey(k.id);
  } catch (e) {
    const row = await db.prepare('UPDATE refunded_orders SET disable_attempts = disable_attempts + 1 WHERE ls_order_id = ? RETURNING disable_attempts')
      .bind(orderId).first<{ disable_attempts: number }>();
    if (row && row.disable_attempts >= MAX_DISABLE_ATTEMPTS) {
      logError(`refund: giving up disabling the licence keys of refunded order ${orderId} after ${row.disable_attempts} attempts; disable them in Lemon Squeezy by hand (xpost already refuses them)`);
    }
    throw e;
  }
  await db.prepare('UPDATE refunded_orders SET ls_disabled_at = ? WHERE ls_order_id = ?').bind(now, orderId).run();
  return true;
}

/** What a subscription status means for a licence (null = leave it alone). Refunds and disabled keys always win. */
export function fromSubscriptionStatus(r: LicenceRef, subStatus: string): Next {
  if (r.status === 'refunded' || r.status === 'disabled') return null;
  const subOwned = r.status === 'active' || (r.status === 'inactive' && SUBSCRIPTION_BLOCK_REASONS.has(r.status_reason ?? ''));
  switch (subStatus) {
    case 'expired': return { status: 'expired', reason: 'expired' };
    case 'paused': return subOwned ? { status: 'inactive', reason: 'subscription_paused' } : null;
    case 'unpaid': return subOwned ? { status: 'inactive', reason: 'unpaid' } : null;
    case 'past_due': return subOwned ? { status: 'active', reason: 'payment_failed' } : null;
    // Cancelled = still paid up to the end of the period: only a warning, and never lifts an existing block.
    case 'cancelled': return r.status === 'active' ? { status: 'active', reason: 'cancelled' } : null;
    case 'active':
    // A refunded payment is only cleared by a later successful payment (invoice event), not by a status change.
    case 'on_trial': return subOwned && r.status_reason !== 'payment_refunded' ? { status: 'active', reason: null } : null;
    default: return null;
  }
}

/** What a subscription invoice event means for a licence. */
function fromInvoice(r: LicenceRef, name: string, a: Attrs): Next {
  if (r.status === 'refunded' || r.status === 'disabled' || r.status === 'expired') return null;
  switch (name) {
    case 'subscription_payment_failed':
      // LS retries for about two weeks; warn, don't block.
      return r.status === 'active' ? { status: 'active', reason: 'payment_failed' } : null;
    case 'subscription_payment_success':
    case 'subscription_payment_recovered':
      if (r.status === 'active' && r.status_reason === 'payment_failed') return { status: 'active', reason: null };
      if (r.status === 'inactive' && (r.status_reason === 'unpaid' || r.status_reason === 'payment_refunded')) return { status: 'active', reason: null };
      return null;
    case 'subscription_payment_refunded': {
      // Only a full refund of the payment blocks (the period it paid for is no longer paid). A later successful
      // payment clears it. Partial refunds are left alone.
      const full = a.refunded === true && (a.refunded_amount ?? 0) >= (a.total ?? Infinity);
      return full ? { status: 'inactive', reason: 'payment_refunded' } : null;
    }
    default:
      return null;
  }
}

/** Works out what an event changes. */
async function planEvent(ctx: Ctx, event: WebhookEvent, name: string): Promise<Plan> {
  const { cfg, db, now } = ctx;
  const a = event.data?.attributes ?? {};
  const type = event.data?.type;
  const objectId = Number(event.data?.id);
  const none = (result: string): Plan => ({ result, statements: [] });
  if (a.store_id === undefined || a.store_id !== cfg.LS_STORE_ID) return none('ignored: other store');

  const statements: D1PreparedStatement[] = [];
  // Stale-event guard: ignore an object older than one already applied.
  const objectKey = `${type}:${objectId}`;
  const updatedAt = parseTime(a.updated_at);
  const stale = async () => {
    if (updatedAt === null) return false;
    const row = await db.prepare('SELECT updated_at FROM ls_object_versions WHERE object_key = ?').bind(objectKey).first<{ updated_at: number }>();
    if (row && row.updated_at > updatedAt) return true;
    statements.push(db.prepare(`INSERT INTO ls_object_versions (object_key, updated_at) VALUES (?, ?)
      ON CONFLICT (object_key) DO UPDATE SET updated_at = max(updated_at, excluded.updated_at)`).bind(objectKey, updatedAt));
    return false;
  };
  const licencesWhere = async (col: 'ls_order_id' | 'ls_license_key_id', value: number) =>
    (await db.prepare(`SELECT id, user_id, status, status_reason, expires_at FROM licences WHERE ${col} = ?`).bind(value).all<LicenceRef>()).results;

  let refs: LicenceRef[] = [];
  let decide: (r: LicenceRef) => Next;
  let disableOrderId: number | undefined;

  switch (type) {
    case 'orders': {
      if (name !== 'order_refunded') return none(`ignored: ${name}`);
      const item = a.first_order_item ?? {};
      if (!isXpostProduct(cfg, a.store_id, item.product_id, item.variant_id)) return none('ignored: other product');
      if (a.status !== 'refunded') return none('ignored: partial refund'); // as in XLISTit
      statements.push(db.prepare(`INSERT INTO refunded_orders (ls_order_id, ls_store_id, ls_product_id, refunded_at) VALUES (?, ?, ?, ?)
        ON CONFLICT (ls_order_id) DO NOTHING`).bind(objectId, a.store_id, item.product_id!, now));
      refs = await licencesWhere('ls_order_id', objectId);
      decide = () => ({ status: 'refunded', reason: 'refunded' });
      disableOrderId = objectId;
      break;
    }
    case 'subscriptions': {
      if (!isXpostProduct(cfg, a.store_id, a.product_id, a.variant_id)) return none('ignored: other product');
      if (await stale()) return none(`ignored: stale ${name}`);
      if (!a.order_id) return none(`ignored: ${name} without order`);
      statements.push(db.prepare(`INSERT INTO ls_subscriptions (ls_subscription_id, ls_order_id, ls_product_id, ls_variant_id, status, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT (ls_subscription_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`)
        .bind(objectId, a.order_id, a.product_id!, a.variant_id ?? null, a.status ?? null, now));
      refs = await licencesWhere('ls_order_id', a.order_id);
      const status = a.status ?? '';
      decide = (r) => fromSubscriptionStatus(r, status);
      break;
    }
    case 'subscription-invoices': {
      if (!a.subscription_id) return none(`ignored: ${name} without subscription`);
      // Invoices carry no product: the subscription must already be known as xpost's, or LS must say it is.
      let orderId = (await db.prepare('SELECT ls_order_id FROM ls_subscriptions WHERE ls_subscription_id = ?').bind(a.subscription_id).first<{ ls_order_id: number }>())?.ls_order_id;
      if (orderId === undefined) {
        if (!ctx.ls.hasApiKey) return none('ignored: unknown subscription');
        const sub = await ctx.ls.getSubscription(a.subscription_id);
        if (!sub) return none('ignored: unknown subscription');
        const sa = sub.attributes;
        if (!isXpostProduct(cfg, sa.store_id, sa.product_id, sa.variant_id)) return none('ignored: other product');
        orderId = sa.order_id;
        statements.push(db.prepare(`INSERT INTO ls_subscriptions (ls_subscription_id, ls_order_id, ls_product_id, ls_variant_id, status, updated_at)
          VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (ls_subscription_id) DO NOTHING`).bind(a.subscription_id, orderId, sa.product_id, sa.variant_id, sa.status, now));
      }
      if (await stale()) return none(`ignored: stale ${name}`);
      refs = await licencesWhere('ls_order_id', orderId);
      decide = (r) => fromInvoice(r, name, a);
      break;
    }
    case 'license-keys': {
      // Licence key objects have no variant_id; the variant was checked at sign-in.
      if (!isXpostProduct(cfg, a.store_id, a.product_id)) return none('ignored: other product');
      if (await stale()) return none(`ignored: stale ${name}`);
      refs = await licencesWhere('ls_license_key_id', objectId);
      const lsStatus = (a.status ?? 'active') as 'inactive' | 'active' | 'expired' | 'disabled';
      const expiresAt = parseTime(a.expires_at);
      decide = (r) => ({ ...deriveStatus(r, { status: lsStatus, disabled: !!a.disabled, expiresAt }, now), expiresAt, lsKeyStatus: lsStatus });
      break;
    }
    default:
      return none(`ignored: ${name}`);
  }

  const changedUsers = new Set<string>();
  const changedIds: string[] = [];
  for (const r of refs) {
    const next = decide(r);
    if (!next) continue;
    const expiresAt = next.expiresAt === undefined ? r.expires_at : next.expiresAt;
    if (next.status === r.status && next.reason === r.status_reason && expiresAt === r.expires_at && !next.lsKeyStatus) continue;
    statements.push(db.prepare('UPDATE licences SET status = ?, status_reason = ?, expires_at = ?, ls_key_status = COALESCE(?, ls_key_status), updated_at = ? WHERE id = ?')
      .bind(next.status, next.reason, expiresAt, next.lsKeyStatus ?? null, now, r.id));
    changedUsers.add(r.user_id);
    changedIds.push(r.id);
  }
  for (const u of changedUsers) statements.push(...syncPauseStatements(db, u, now));
  if (changedIds.length) {
    statements.push(db.prepare(`INSERT INTO audit_log (user_id, at, kind, code) SELECT DISTINCT user_id, ?, 'licence_status', ? FROM licences WHERE id IN (${changedIds.map(() => '?').join(',')})`)
      .bind(now, name, ...changedIds));
  }
  const what = type === 'orders' ? 'refunded' : name;
  const result = refs.length ? `${what}: ${changedIds.length} of ${refs.length} licence(s) changed` : `${what}: no licence yet`;
  return { result, statements, ...(disableOrderId !== undefined ? { disableOrderId } : {}) };
}
