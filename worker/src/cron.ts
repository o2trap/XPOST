/**
 * Scheduled licence re-validation (cron trigger in wrangler.toml).
 * SCATTERit stores only a hash of each licence key, so it re-reads keys through Lemon Squeezy's main API by licence key
 * ID (GET /v1/license-keys/:id, needs LS_API_KEY) instead of the License API.
 * Free plan budget per run: 10 ms CPU, 50 subrequests, 50 D1 queries (a batch counts as one). So each run takes at
 * most REVALIDATE_BATCH (default 15) licences whose last_validated_at is older than REVALIDATE_HOURS: 1 select,
 * up to 15 LS requests, 1 batch write. Then it retries disabling the keys of up to REFUND_RETRIES refunded orders
 * whose LS disable failed earlier (webhook.ts).
 * Errors: LS down, rate limiting or a bad API key (network, 5xx, 429, 401, 403) stop the run; every remaining licence
 * is retried next run. Any other error is about that one key: it is logged, its last_validated_at is bumped (so it
 * is retried after REVALIDATE_HOURS instead of blocking the queue), its status is left as it was, and the run goes on.
 */
import type { LicenceStatus } from '@scatterit/shared';
import type { Ctx } from './app';
import { HOUR_MS, licenceConfigured } from './config';
import { LemonSqueezyError } from './lemonsqueezy';
import { deriveStatus, isScatteritProduct, parseTime } from './licence';
import { logError, logInfo } from './log';
import { MAX_DISABLE_ATTEMPTS, disableRefundedOrder } from './webhook';
import { syncPauseStatements } from './pause';

export interface RevalidateResult { checked: number; changed: number; failed: number; refundsRetried: number; skipped?: string; error?: string }

/** Refunded orders whose LS key disable is retried per run (each costs 2+ subrequests). */
export const REFUND_RETRIES = 3;
/** Stop starting new LS work once this many subrequests were made in the run (Free plan limit: 50). */
export const SUBREQUEST_BUDGET = 45;

interface Row { id: string; user_id: string; ls_license_key_id: number; ls_variant_id: number; status: LicenceStatus; status_reason: string | null; expires_at: number | null }

export async function revalidateLicences(ctx: Ctx): Promise<RevalidateResult> {
  const { cfg, db, now } = ctx;
  if (!licenceConfigured(cfg)) return { checked: 0, changed: 0, failed: 0, refundsRetried: 0, skipped: 'not_configured' };
  if (!ctx.ls.hasApiKey) return { checked: 0, changed: 0, failed: 0, refundsRetried: 0, skipped: 'no_api_key' };
  const due = await db.prepare(
    `SELECT id, user_id, ls_license_key_id, ls_variant_id, status, status_reason, expires_at FROM licences
      WHERE status <> 'refunded' AND last_validated_at < ? ORDER BY last_validated_at LIMIT ?`,
  ).bind(now - cfg.REVALIDATE_HOURS * HOUR_MS, cfg.REVALIDATE_BATCH).all<Row>();

  const statements: D1PreparedStatement[] = [];
  const affectedUsers = new Set<string>();
  let checked = 0, changed = 0, failed = 0, error: string | undefined;
  for (const r of due.results) {
    let next: { status: LicenceStatus; reason: string | null }, expiresAt = r.expires_at, lsKeyStatus: string | null = null;
    try {
      const k = await ctx.ls.getLicenceKey(r.ls_license_key_id);
      if (!k) next = { status: 'disabled', reason: 'not_found' };
      // LS licence key objects have no variant_id: check the variant recorded at sign-in against today's config.
      else if (!isScatteritProduct(cfg, k.attributes.store_id, k.attributes.product_id, r.ls_variant_id)) next = { status: 'disabled', reason: 'not_found' };
      else {
        expiresAt = parseTime(k.attributes.expires_at);
        lsKeyStatus = k.attributes.status;
        next = deriveStatus(r, { status: k.attributes.status, disabled: k.attributes.disabled, expiresAt }, now);
      }
    } catch (e) {
      if (!(e instanceof LemonSqueezyError) || e.global) {
        error = e instanceof LemonSqueezyError ? e.message : String(e);
        logError('revalidate: stopping this run', error);
        break;
      }
      failed++;
      logError('revalidate: skipping one licence until next time', e.message);
      statements.push(db.prepare('UPDATE licences SET last_validated_at = ? WHERE id = ?').bind(now, r.id));
      continue;
    }
    checked++;
    if (next.status !== r.status || next.reason !== r.status_reason || expiresAt !== r.expires_at) {
      changed++;
      affectedUsers.add(r.user_id);
      statements.push(db.prepare(
        `UPDATE licences SET status = ?, status_reason = ?, expires_at = ?, ls_key_status = COALESCE(?, ls_key_status), last_validated_at = ?, updated_at = ? WHERE id = ?`,
      ).bind(next.status, next.reason, expiresAt, lsKeyStatus, now, now, r.id));
      statements.push(db.prepare("INSERT INTO audit_log (user_id, at, kind, code) VALUES (?, ?, 'licence_status', ?)").bind(r.user_id, now, `revalidate:${next.status}`));
    } else {
      statements.push(db.prepare('UPDATE licences SET last_validated_at = ?, ls_key_status = COALESCE(?, ls_key_status) WHERE id = ?').bind(now, lsKeyStatus, r.id));
    }
  }
  for (const u of affectedUsers) statements.push(...syncPauseStatements(db, u, now));
  if (statements.length) await db.batch(statements);

  let refundsRetried = 0;
  if (!error) {
    const pending = await db.prepare('SELECT ls_order_id FROM refunded_orders WHERE ls_disabled_at IS NULL AND disable_attempts < ? ORDER BY refunded_at LIMIT ?')
      .bind(MAX_DISABLE_ATTEMPTS, REFUND_RETRIES).all<{ ls_order_id: number }>();
    for (const o of pending.results) {
      // Each order costs 1 list request + 1 per key; keep a margin under the per-invocation limit.
      if (ctx.ls.requests + 3 > SUBREQUEST_BUDGET) break;
      try { if (await disableRefundedOrder(ctx, o.ls_order_id)) refundsRetried++; } catch (e) {
        logError('cron: refund key disable failed again', e instanceof LemonSqueezyError ? e.message : e);
        break;
      }
    }
  }
  const result: RevalidateResult = { checked, changed, failed, refundsRetried, ...(error ? { error } : {}) };
  logInfo(`cron revalidate: checked ${checked}, changed ${changed}, failed ${failed}, refund disables ${refundsRetried}${error ? ', stopped on error' : ''}`);
  return result;
}
