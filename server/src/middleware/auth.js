import { verifyDeviceToken } from '../utils/tokens.js';
import { db, nowMs } from '../db/db.js';

/**
 * Zero-Trust request guard:
 *  1. Verify JWT signature + expiry (cryptographic trust).
 *  2. Re-verify against live DB state (session still active & not expired,
 *     device still connected/not removed) — a valid-but-stale token is
 *     rejected even if it hasn't technically expired yet.
 *  3. Touch last_activity_at / last_seen_at (sliding activity window used
 *     by the inactivity-logout job).
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing_token' });

  const payload = verifyDeviceToken(token);
  if (!payload) return res.status(401).json({ error: 'invalid_or_expired_token' });

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(payload.sid);
  if (!session || session.status !== 'active') {
    return res.status(401).json({ error: 'session_not_active' });
  }
  const now = nowMs();
  if (session.expires_at < now) {
    return res.status(401).json({ error: 'session_expired' });
  }

  const device = db.prepare('SELECT * FROM devices WHERE id = ? AND session_id = ?')
    .get(payload.did, payload.sid);
  if (!device || device.status !== 'connected') {
    return res.status(401).json({ error: 'device_not_connected' });
  }

  db.prepare('UPDATE sessions SET last_activity_at = ? WHERE id = ?').run(now, session.id);
  db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').run(now, device.id);

  req.auth = { sessionId: session.id, deviceId: device.id, isHost: !!payload.host };
  req.session_ = session;
  req.device_ = device;
  next();
}
