/**
 * Licence checks, forked from XLISTit website/lib/licence.ts (statusError, productError, mapLsError, key format).
 * SCATTERit changes:
 * - Web sign-in only VALIDATES the key. It never activates a Lemon Squeezy instance, because LS instances are the
 *   device slots (activation_limit) that XLISTit-style desktop binding uses; activating one per browser would let a
 *   phone sign-in use up a desktop slot. Web sessions are limited by SCATTERit itself (MAX_WEB_SESSIONS, in D1).
 *   M7 (desktop) will activate instances, as XLISTit does.
 * - Product check is store_id AND product_id (single product) AND, if configured, the variant: the store is shared
 *   with XLISTit, so an XLISTit key must never unlock SCATTERit. Unset IDs fail closed.
 * - The purchase email must match LS meta.customer_email (case-insensitive).
 * - No trial, ambassador or Ed25519 token code (token signing comes back for desktop in M7).
 */
import { z } from 'zod';
import type { LicenceStatus } from '@scatterit/shared';
import type { Config } from './config';
import type { LsLicenceResponse, LsLicenceKey } from './lemonsqueezy';
import { sha256Hex } from './crypto';

/** Lemon Squeezy keys are UUID-like; same rule as XLISTit's `Key`. */
export const LicenceKey = z.string().trim().min(8).max(100).regex(/^[A-Za-z0-9-]+$/);
export const Email = z.string().trim().toLowerCase().max(254).pipe(z.email());

/** SHA-256 of the normalised key (trimmed, upper-cased). Stored instead of the key. */
export const licenceKeyHash = (key: string) => sha256Hex(`scatterit-licence:${key.trim().toUpperCase()}`);
export const keyLast4 = (key: string) => key.trim().slice(-4).toUpperCase();

export type SignInFailure = 'invalid_credentials' | 'expired' | 'disabled' | 'not_configured';

export interface ValidLicence {
  lsKeyId: number; lsKeyStatus: LsLicenceKey['status']; storeId: number; productId: number; variantId: number; orderId: number;
  customerEmail: string; expiresAt: number | null; activationLimit: number | null;
}

/** Store, product and (optional) variant must be SCATTERit's. Missing config fails closed. */
export function isScatteritProduct(cfg: Config, storeId: unknown, productId: unknown, variantId?: unknown): boolean {
  if (cfg.LS_STORE_ID === undefined || cfg.LS_PRODUCT_ID === undefined) return false;
  if (storeId !== cfg.LS_STORE_ID || productId !== cfg.LS_PRODUCT_ID) return false;
  if (cfg.LS_VARIANT_IDS.length && variantId !== undefined && !cfg.LS_VARIANT_IDS.includes(variantId as number)) return false;
  return true;
}

const parseTime = (s: string | null | undefined): number | null => {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
};

/**
 * Checks a License API `validate` response for web sign-in. Order matters: product and email are checked before
 * status, so a distinct reason (expired, disabled) is only revealed to someone who has the right key AND email.
 * Anything else is the generic `invalid_credentials`.
 */
export function checkForSignIn(cfg: Config, body: LsLicenceResponse, email: string, now: number): { ok: true; licence: ValidLicence } | { ok: false; code: SignInFailure } {
  if (cfg.LS_STORE_ID === undefined || cfg.LS_PRODUCT_ID === undefined) return { ok: false, code: 'not_configured' };
  const k = body.license_key, m = body.meta;
  if (!k || !m) return { ok: false, code: 'invalid_credentials' };
  // variant_id is always present in validate responses, so variant restrictions are enforced here.
  if (!isScatteritProduct(cfg, m.store_id, m.product_id, m.variant_id ?? -1)) return { ok: false, code: 'invalid_credentials' };
  const customerEmail = (m.customer_email ?? '').trim().toLowerCase();
  if (!customerEmail || customerEmail !== email) return { ok: false, code: 'invalid_credentials' };
  const expiresAt = parseTime(k.expires_at);
  if (k.status === 'disabled') return { ok: false, code: 'disabled' };
  if (k.status === 'expired' || (expiresAt !== null && expiresAt <= now)) return { ok: false, code: 'expired' };
  if (body.valid === false) return { ok: false, code: mapLsError(body.error) };
  return {
    ok: true,
    licence: {
      lsKeyId: k.id, lsKeyStatus: k.status, storeId: m.store_id, productId: m.product_id, variantId: m.variant_id, orderId: m.order_id,
      customerEmail, expiresAt, activationLimit: k.activation_limit ?? null,
    },
  };
}

/** Forked from XLISTit mapLsError, narrowed to web sign-in outcomes (instance and seat errors cannot happen here). */
export function mapLsError(error: string | null): SignInFailure {
  const e = (error ?? '').toLowerCase();
  if (e.includes('expired')) return 'expired';
  if (e.includes('disabled')) return 'disabled';
  return 'invalid_credentials';
}

/** Reasons that do not block posting; shown as a warning. */
export const WARNING_REASONS = new Set(['payment_failed', 'cancelled']);
/** 'inactive' reasons set by subscription events; they stay until a subscription event clears them. */
export const SUBSCRIPTION_BLOCK_REASONS = new Set(['subscription_paused', 'unpaid', 'payment_refunded']);

/**
 * SCATTERit status from a fresh Lemon Squeezy reading. `refunded` is sticky (LS has no refunded key status), and a
 * subscription block (paused, unpaid, refunded payment) stays until a subscription event clears it.
 */
export function deriveStatus(
  current: { status: LicenceStatus; status_reason: string | null } | null,
  ls: { status: LsLicenceKey['status']; disabled?: boolean; expiresAt: number | null },
  now: number,
): { status: LicenceStatus; reason: string | null } {
  if (current?.status === 'refunded') return { status: 'refunded', reason: current.status_reason ?? 'refunded' };
  if (ls.status === 'disabled' || ls.disabled) return { status: 'disabled', reason: 'disabled' };
  if (ls.status === 'expired' || (ls.expiresAt !== null && ls.expiresAt <= now)) return { status: 'expired', reason: 'expired' };
  if (current?.status === 'inactive' && SUBSCRIPTION_BLOCK_REASONS.has(current.status_reason ?? '')) return { status: 'inactive', reason: current.status_reason };
  return { status: 'active', reason: current && WARNING_REASONS.has(current.status_reason ?? '') ? current.status_reason : null };
}

export { parseTime };
