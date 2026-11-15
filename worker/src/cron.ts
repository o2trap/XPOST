/**
 * Scheduled licence re-validation (cron trigger in wrangler.toml).
 * xpost stores only a hash of each licence key, so it re-reads keys through Lemon Squeezy's main API by licence key
 * ID (GET /v1/license-keys/:id, needs LS_API_KEY) instead of the License API.
 * Free plan budget per run: 10 ms CPU, 50 subrequests, 50 D1 queries (a batch counts as one). So each run takes at
 * most REVALIDATE_BATCH (default 15) licences whose last_validated_at is older than REVALIDATE_HOURS: 1 select,
 * up to 15 LS requests, 1 batch write. Stops early if LS is failing (it will be retried next run).
 */
import type { LicenceStatus } from '@xpost/shared';
import type { Ctx } from './app';
import { HOUR_MS, licenceConfigured } from './config';
import { LemonSqueezyError } from './lemonsqueezy';
import { deriveStatus, isXpostProduct, parseTime } from './licence';
import { logError, logInfo } from './log';
import { syncPauseStatements } from './pause';

export interface RevalidateResult { checked: number; changed: number; skipped?: string; error?: string }

interface Row { id: string; user_id: string; ls_license_key_id: number; status: LicenceStatus; status_reason: string | null; expires_at: number | null }

export async function revalidateLicences(ctx: Ctx): Promise<RevalidateResult> {
  const { cfg, db, now } = ctx;
  if (!licenceConfigured(cfg)) return { checked: 0, changed: 0, skipped: 'not_configured' };
  if (!ctx.ls.hasApiKey) return { checked: 0, changed: 0, skipped: 'no_api_key' };
  const due = await db.prepare(
    `SELECT id, user_id, ls_license_key_id, status, status_reason, expires_at FROM licences
      WHERE status <> 'refunded' AND last_validated_at < ? ORDER BY last_validated_at LIMIT ?`,
  ).bind(now - cfg.REVALIDATE_HOURS * HOUR_MS, cfg.REVALIDATE_BATCH).all<Row>();

  const statements: D1PreparedStatement[] = [];
  const affectedUsers = new Set<string>();
  let checked = 0, changed = 0, error: string | undefined;
  for (const r of due.results) {
    let next: { status: LicenceStatus; reason: string | null }, expiresAt = r.expires_at, lsKeyStatus: string | null = null;
    try {
      const k = await ctx.ls.getLicenceKey(r.ls_license_key_id);
      if (!k) next = { status: 'disabled', reason: 'not_found' };
      else if (!isXpostProduct(cfg, k.attributes.store_id, k.attributes.product_id)) next = { status: 'disabled', reason: 'not_found' };
      else {
        expiresAt = parseTime(k.attributes.expires_at);
        lsKeyStatus = k.attributes.status;
        next = deriveStatus(r, { status: k.attributes.status, disabled: k.attributes.disabled, expiresAt }, now);
      }
    } catch (e) {
      error = e instanceof LemonSqueezyError ? e.message : String(e);
      logError('revalidate: stopping this run', error);
      break;
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
  const result: RevalidateResult = { checked, changed, ...(error ? { error } : {}) };
  logInfo(`cron revalidate: checked ${checked}, changed ${changed}${error ? ', stopped on error' : ''}`);
  return result;
}
