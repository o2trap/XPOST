/**
 * Licence gate. Posting and reminders need a usable licence; this is the one place that decides, so M2+ routes call
 * licenceBlock()/requireActiveLicence() instead of re-implementing the rule. Messages are plain English.
 */
import type { ApiError, LicenceInfo, LicenceStatus } from '@scatterit/shared';

export interface LicenceRow {
  status: LicenceStatus; status_reason: string | null; expires_at: number | null; key_last4: string; last_validated_at: number;
}

const BLOCK_MESSAGES: Record<string, string> = {
  refunded: 'Your SCATTERit purchase was refunded, so new posts and reminders are switched off. Buy SCATTERit again to carry on.',
  expired: 'Your SCATTERit licence has expired. Renew it in Lemon Squeezy to post and get reminders again.',
  disabled: 'Your SCATTERit licence key has been disabled. Contact support if you think this is a mistake.',
  subscription_paused: 'Your SCATTERit subscription is paused. Resume it in Lemon Squeezy to post and get reminders again.',
  unpaid: "Your SCATTERit subscription payment couldn't be collected, so new posts and reminders are paused. Update your card in Lemon Squeezy.",
  payment_refunded: 'Your last SCATTERit subscription payment was refunded, so new posts and reminders are paused until the next payment.',
  not_found: 'Lemon Squeezy no longer recognises your SCATTERit licence key. Contact support.',
  inactive: 'Your SCATTERit licence is not active right now.',
};
const WARNING_MESSAGES: Record<string, string> = {
  payment_failed: 'Your last SCATTERit payment failed. Lemon Squeezy will retry it; update your card there so you keep access.',
  cancelled: 'Your SCATTERit subscription is cancelled. SCATTERit keeps working until the end of the period you paid for.',
};

// TODO(M4): the reminder sweep must call licenceBlock() for each reminder's user before sending (pause.ts pauses
// reminders when a licence changes, but the sweep is the last line of defence, e.g. for a licence that expires by
// time between cron runs).

/** Why posting is blocked, or null when the licence is usable. Expiry is checked live, not only by the cron. */
export function licenceBlock(l: Pick<LicenceRow, 'status' | 'status_reason' | 'expires_at'>, now: number): { code: string; message: string } | null {
  if (l.status === 'active' && (l.expires_at === null || l.expires_at > now)) return null;
  const code = l.status === 'active' ? 'expired' : l.status === 'inactive' ? (l.status_reason ?? 'inactive') : l.status;
  return { code, message: BLOCK_MESSAGES[code] ?? BLOCK_MESSAGES.inactive! };
}

export function licenceInfo(l: LicenceRow, now: number): LicenceInfo {
  const block = licenceBlock(l, now);
  return {
    status: block && l.status === 'active' ? 'expired' : l.status,
    reason: block ? block.code : l.status_reason,
    message: block ? block.message : (l.status_reason ? WARNING_MESSAGES[l.status_reason] ?? null : null),
    canPost: !block,
    keyLast4: l.key_last4,
    expiresAt: l.expires_at,
    lastValidatedAt: l.last_validated_at,
  };
}

/** For M2+ routes that create or schedule posts: a 403 with the plain-English reason, or null to carry on. */
export function requireActiveLicence(l: LicenceRow, now: number): Response | null {
  const block = licenceBlock(l, now);
  if (!block) return null;
  const body: ApiError = { ok: false, code: 'licence_blocked', message: block.message };
  return Response.json({ ...body, reason: block.code }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
}
