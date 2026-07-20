import { Router } from 'express';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { db, nowMs } from '../db/db.js';
import { sha256, safeEqual } from '../utils/crypto.js';
import { signDeviceToken } from '../utils/tokens.js';
import { requireAuth } from '../middleware/auth.js';
import { logActivity } from '../utils/activity.js';
import { pairingLimiter } from '../middleware/rateLimit.js';

export const deviceRouter = Router();

const joinSchema = z.object({
  deviceName: z.string().min(1).max(64),
  deviceType: z.enum(['desktop', 'mobile', 'tablet', 'unknown']).default('unknown'),
  publicKeyJwk: z.string().max(2000).optional(),
  pairingCode: z.string().length(6).optional(),
  qrToken: z.string().min(10).max(200).optional(),
}).refine((d) => d.pairingCode || d.qrToken, { message: 'pairingCode_or_qrToken_required' });

// A second device joins an existing session using either the 6-digit code
// or the QR token. Only one non-host device may be connected at a time
// (SecureDrop is a 1:1 ephemeral pairing, matching the "pair two devices"
// use case), keeping the trust boundary simple and auditable.
deviceRouter.post('/join', pairingLimiter, (req, res) => {
  const parsed = joinSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
  const { deviceName, deviceType, publicKeyJwk, pairingCode, qrToken } = parsed.data;

  const now = nowMs();

  const candidates = db.prepare(
    `SELECT * FROM sessions WHERE status IN ('pending','active') AND pairing_expires_at > ? AND expires_at > ?`
  ).all(now, now);

  const session = candidates.find((s) => {
    if (pairingCode) return safeEqual(sha256(pairingCode), s.code_hash);
    if (qrToken) return safeEqual(sha256(qrToken), s.qr_token_hash);
    return false;
  });

  if (!session) return res.status(404).json({ error: 'invalid_or_expired_pairing' });

  const existingPeers = db.prepare(
    `SELECT COUNT(*) AS c FROM devices WHERE session_id = ? AND is_host = 0 AND status = 'connected'`
  ).get(session.id);
  if (existingPeers.c > 0) return res.status(409).json({ error: 'session_already_paired' });

  const deviceId = nanoid();
  db.prepare(
    `INSERT INTO devices (id, session_id, device_name, device_type, is_host, public_key_jwk, joined_at, last_seen_at, status)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?, 'connected')`
  ).run(deviceId, session.id, deviceName, deviceType, publicKeyJwk || null, now, now);

  db.prepare(`UPDATE sessions SET status = 'active', last_activity_at = ? WHERE id = ?`)
    .run(now, session.id);

  logActivity(session.id, deviceId, 'device_joined', `peer="${deviceName}"`);

  const token = signDeviceToken({ sessionId: session.id, deviceId, isHost: false });
  const host = db.prepare('SELECT id, device_name, public_key_jwk FROM devices WHERE session_id=? AND is_host=1')
    .get(session.id);

  res.status(200).json({
    sessionId: session.id,
    deviceId,
    token,
    expiresAt: session.expires_at,
    peer: host ? { deviceId: host.id, deviceName: host.device_name, publicKeyJwk: host.public_key_jwk } : null,
  });
});

// List devices connected to the current session.
deviceRouter.get('/', requireAuth, (req, res) => {
  const rows = db.prepare(
    `SELECT id, device_name, device_type, is_host, joined_at, last_seen_at, status, public_key_jwk
     FROM devices WHERE session_id = ? ORDER BY joined_at ASC`
  ).all(req.auth.sessionId);
  res.json({ devices: rows });
});

// Remove/kick a device (remote disconnect). Host can remove the peer; a
// device can always remove itself (leave).
deviceRouter.post('/:deviceId/remove', requireAuth, (req, res) => {
  const { deviceId } = req.params;
  const isSelf = deviceId === req.auth.deviceId;
  if (!isSelf && !req.auth.isHost) return res.status(403).json({ error: 'host_only' });

  const target = db.prepare('SELECT * FROM devices WHERE id = ? AND session_id = ?')
    .get(deviceId, req.auth.sessionId);
  if (!target) return res.status(404).json({ error: 'device_not_found' });

  db.prepare(`UPDATE devices SET status = 'removed' WHERE id = ?`).run(deviceId);
  logActivity(req.auth.sessionId, req.auth.deviceId, 'device_removed', `target="${target.device_name}" self=${isSelf}`);

  // If the host removes itself or the only peer, and no connected devices
  // remain, end the session entirely.
  const remaining = db.prepare(
    `SELECT COUNT(*) AS c FROM devices WHERE session_id = ? AND status = 'connected'`
  ).get(req.auth.sessionId);
  if (remaining.c === 0 || (isSelf && target.is_host)) {
    const now = nowMs();
    db.prepare(`UPDATE sessions SET status='ended', ended_at=?, ended_reason='remote_disconnect' WHERE id=?`)
      .run(now, req.auth.sessionId);
    setImmediate(() => db.prepare('DELETE FROM sessions WHERE id = ?').run(req.auth.sessionId));
  }

  res.json({ ok: true });
});

// Heartbeat to keep last_seen_at fresh without a "real" API call.
deviceRouter.post('/heartbeat', requireAuth, (req, res) => {
  res.json({ ok: true, serverTime: nowMs() });
});
