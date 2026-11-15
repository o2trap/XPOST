/**
 * Licence pause. When a user has no usable licence, scheduled targets become 'paused' (remembering they were
 * 'scheduled') and pending reminders become 'paused'; when a usable licence comes back, both are restored.
 * Sessions are kept, so the user can sign in and read why (GET /api/me -> licence.message).
 *
 * The statements decide from the licences table itself, so they are idempotent and safe to append to any batch
 * that changes a licence (D1 runs a batch's statements in order, in one transaction).
 */
const USABLE = `EXISTS (SELECT 1 FROM licences WHERE user_id = ?1 AND status = 'active' AND (expires_at IS NULL OR expires_at > ?2))`;

export function syncPauseStatements(db: D1Database, userId: string, now: number): D1PreparedStatement[] {
  return [
    db.prepare(`UPDATE post_targets SET status = 'paused', paused_from = status, updated_at = ?2
      WHERE user_id = ?1 AND status = 'scheduled' AND NOT ${USABLE}`).bind(userId, now),
    db.prepare(`UPDATE reminders SET status = 'paused', updated_at = ?2
      WHERE user_id = ?1 AND status = 'pending' AND NOT ${USABLE}`).bind(userId, now),
    db.prepare(`UPDATE post_targets SET status = paused_from, paused_from = NULL, updated_at = ?2
      WHERE user_id = ?1 AND status = 'paused' AND paused_from IS NOT NULL AND ${USABLE}`).bind(userId, now),
    db.prepare(`UPDATE reminders SET status = 'pending', updated_at = ?2
      WHERE user_id = ?1 AND status = 'paused' AND ${USABLE}`).bind(userId, now),
  ];
}
