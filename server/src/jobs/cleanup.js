import { db, nowMs } from '../db/db.js';
import { config } from '../config.js';
import { logActivity } from '../utils/activity.js';

/**
 * Runs every 15s. Enforces:
 *  - Hard session TTL (expires_at)
 *  - Sliding inactivity timeout (last_activity_at)
 *  - Unpaired sessions whose pairing window lapsed with no second device
 * Ending a session here triggers the same cascade delete as manual end,
 * so temporary application-managed data is removed automatically.
 */
export function startCleanupJob(io) {
  const interval = setInterval(() => {
    const now = nowMs();
    const inactivityCutoff = now - config.inactivityTimeoutMinutes * 60_000;

    const expired = db.prepare(
      `SELECT * FROM sessions WHERE status IN ('pending','active') AND expires_at < ?`
    ).all(now);

    const inactive = db.prepare(
      `SELECT * FROM sessions WHERE status = 'active' AND last_activity_at < ?`
    ).all(inactivityCutoff);

    const unpaired = db.prepare(
      `SELECT * FROM sessions WHERE status = 'pending' AND pairing_expires_at < ?`
    ).all(now);

    const toEnd = new Map();
    for (const s of expired) toEnd.set(s.id, 'expired');
    for (const s of inactive) if (!toEnd.has(s.id)) toEnd.set(s.id, 'inactivity');
    for (const s of unpaired) if (!toEnd.has(s.id)) toEnd.set(s.id, 'expired');

    for (const [sessionId, reason] of toEnd) {
      db.prepare(`UPDATE sessions SET status='ended', ended_at=?, ended_reason=? WHERE id=?`)
        .run(now, reason, sessionId);
      logActivity(sessionId, null, 'session_ended', reason);
      io.to(sessionId).emit('session:ended', { reason });
      db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    }
  }, 15_000);

  return () => clearInterval(interval);
}
