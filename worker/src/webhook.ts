/**
 * Lemon Squeezy webhook: POST /api/webhooks/lemonsqueezy.
 * verifyWebhookSignature is forked from XLISTit website/lib/webhook.ts (hex HMAC-SHA256 of the raw body, checked
 * with Web Crypto's constant-time verify). xpost changes (Step 0 "fix, don't copy" list):
 * - the store check is mandatory, and the product (and variant, if configured) must be xpost's: the store is shared
 *   with XLISTit, whose events are acknowledged and ignored;
 * - idempotent: each delivery is recorded in webhook_events (key = SHA-256 of the raw body; LS sends no event ID);
 * - more events than order_refunded: subscription expiry, pause/resume, payment failure/recovery, licence key updates;
 * - D1 is the source of truth: events change licences.status and pause/resume the owner's scheduled targets and
 *   reminders (pause.ts). Sessions are kept so the user can read why in the app.
 */
import type { LicenceStatus } from '@xpost/shared';
import type { Ctx } from './app';
import { licenceConfigured } from './config';
import { sha256Hex } from './crypto';
import { json } from './http';
import { deriveStatus, isXpostProduct, parseTime } from './licence';
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
  store_id?: number; product_id?: number; variant_id?: number; order_id?: number; status?: string; disabled?: boolean;
  expires_at?: string | null; first_order_item?: { product_id?: number; variant_id?: number };
}
export interface WebhookEvent { meta?: { event_name?: string; test_mode?: boolean }; data?: { id?: string; type?: string; attributes?: Attrs } }

interface LicenceRef { id: string; user_id: string; status: LicenceStatus; status_reason: string | null; expires_at: number | null }

const MAX_BODY = 256 * 1024;

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
  const seen = await db.prepare('SELECT processed_at FROM webhook_events WHERE event_key = ?').bind(eventKey).first<{ processed_at: number | null }>();
  if (seen?.processed_at) return json({ ok: true, result: 'duplicate' });

  try {
    const { result, statements } = await planEvent(ctx, event, name);
    await db.batch([
      db.prepare('INSERT OR IGNORE INTO webhook_events (event_key, name, received_at) VALUES (?, ?, ?)').bind(eventKey, name, now),
      ...statements,
      db.prepare('UPDATE webhook_events SET processed_at = ?, result = ? WHERE event_key = ?').bind(now, result.slice(0, 200), eventKey),
    ]);
    // XLISTit behaviour, kept: a full refund also disables the key in Lemon Squeezy (needs LS_API_KEY). Done after
    // the D1 update; if it fails, LS retries and the D1 part is a no-op the second time.
    if (name === 'order_refunded' && result.startsWith('refunded') && ctx.ls.hasApiKey && event.data?.id) {
      const keys = await ctx.ls.licenceKeysForOrder(Number(event.data.id));
      for (const k of keys) if (k.attributes.status !== 'disabled') await ctx.ls.disableLicenceKey(k.id);
    }
    logInfo(`webhook ${name}: ${result}`);
    return json({ ok: true, result });
  } catch (e) {
    logError('webhook failed', name, e);
    // Record the delivery as received-but-unprocessed so a retry reprocesses it; non-2xx makes LS retry.
    await db.prepare('INSERT OR IGNORE INTO webhook_events (event_key, name, received_at) VALUES (?, ?, ?)').bind(eventKey, name, now).run().catch(() => undefined);
    return json({ ok: false }, 500);
  }
}

const productOf = (a: Attrs) => ({ productId: a.product_id ?? a.first_order_item?.product_id, variantId: a.variant_id ?? a.first_order_item?.variant_id });

/** Works out what an event changes. Returns D1 statements to run in one batch with the idempotency record. */
async function planEvent(ctx: Ctx, event: WebhookEvent, name: string): Promise<{ result: string; statements: D1PreparedStatement[] }> {
  const { cfg, db, now } = ctx;
  const a = event.data?.attributes ?? {};
  const none = (result: string) => ({ result, statements: [] });
  if (a.store_id !== cfg.LS_STORE_ID) return none('ignored: other store');
  const { productId, variantId } = productOf(a);
  if (!isXpostProduct(cfg, a.store_id, productId, variantId)) return none('ignored: other product');

  // Which licences the event is about: licence-key events by key ID, order and subscription events by order ID.
  let refs: LicenceRef[];
  const cols = 'id, user_id, status, status_reason, expires_at';
  if (event.data?.type === 'license-keys') {
    refs = (await db.prepare(`SELECT ${cols} FROM licences WHERE ls_license_key_id = ?`).bind(Number(event.data.id)).all<LicenceRef>()).results;
  } else {
    const orderId = event.data?.type === 'orders' ? Number(event.data.id) : a.order_id;
    if (!orderId) return none(`ignored: ${name} without order`);
    refs = (await db.prepare(`SELECT ${cols} FROM licences WHERE ls_order_id = ?`).bind(orderId).all<LicenceRef>()).results;
  }
  if (!refs.length) return none(`no licence: ${name}`);

  const set = (r: LicenceRef, status: LicenceStatus, reason: string | null, extra: { expiresAt?: number | null; lsKeyStatus?: string } = {}) =>
    db.prepare(`UPDATE licences SET status = ?, status_reason = ?, expires_at = ?, ls_key_status = COALESCE(?, ls_key_status), updated_at = ? WHERE id = ?`)
      .bind(status, reason, extra.expiresAt === undefined ? r.expires_at : extra.expiresAt, extra.lsKeyStatus ?? null, now, r.id);

  const statements: D1PreparedStatement[] = [];
  let label = '';
  const update = (r: LicenceRef, status: LicenceStatus, reason: string | null, extra?: { expiresAt?: number | null; lsKeyStatus?: string }) => {
    statements.push(set(r, status, reason, extra));
  };
  for (const r of refs) {
    switch (name) {
      case 'order_refunded':
        // Partial refunds are left alone (as in XLISTit).
        if (a.status !== 'refunded') return none('ignored: partial refund');
        update(r, 'refunded', 'refunded'); label = 'refunded';
        break;
      case 'subscription_expired':
        if (r.status !== 'refunded') update(r, 'expired', 'expired'); label = 'expired';
        break;
      case 'subscription_paused':
        if (r.status === 'active') update(r, 'inactive', 'subscription_paused'); label = 'paused';
        break;
      case 'subscription_resumed':
      case 'subscription_unpaused':
        if (r.status === 'inactive' && r.status_reason === 'subscription_paused') update(r, 'active', null);
        else if (r.status === 'active' && r.status_reason === 'cancelled') update(r, 'active', null);
        label = 'resumed';
        break;
      case 'subscription_cancelled':
        // Still valid until the paid period ends; expiry arrives as subscription_expired (or the cron sees it).
        if (r.status === 'active') update(r, 'active', 'cancelled'); label = 'cancelled';
        break;
      case 'subscription_payment_failed':
        // LS retries for about two weeks; warn, don't block.
        if (r.status === 'active') update(r, 'active', 'payment_failed'); label = 'payment failed';
        break;
      case 'subscription_payment_success':
      case 'subscription_payment_recovered':
        if (r.status === 'active' && r.status_reason === 'payment_failed') update(r, 'active', null); label = 'payment ok';
        break;
      case 'license_key_created':
      case 'license_key_updated': {
        const lsStatus = (a.status ?? 'active') as 'inactive' | 'active' | 'expired' | 'disabled';
        const expiresAt = parseTime(a.expires_at);
        const next = deriveStatus(r, { status: lsStatus, disabled: a.disabled, expiresAt }, now);
        update(r, next.status, next.reason, { expiresAt, lsKeyStatus: lsStatus }); label = `key ${next.status}`;
        break;
      }
      default:
        return none(`ignored: ${name}`);
    }
  }
  if (!statements.length) return none(`unchanged: ${label}`);
  for (const userId of new Set(refs.map((r) => r.user_id))) statements.push(...syncPauseStatements(db, userId, now));
  statements.push(db.prepare(`INSERT INTO audit_log (user_id, at, kind, code) SELECT DISTINCT user_id, ?, 'licence_status', ? FROM licences WHERE id IN (${refs.map(() => '?').join(',')})`)
    .bind(now, name, ...refs.map((r) => r.id)));
  return { result: `${label} (${refs.length} licence${refs.length === 1 ? '' : 's'})`, statements };
}
