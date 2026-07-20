import { Router } from 'express';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { db, nowMs } from '../db/db.js';
import { config } from '../config.js';
import { generatePairingCode, generateQrToken, sha256 } from '../utils/crypto.js';
import { signDeviceToken } from '../utils/tokens.js';
import { requireAuth } from '../middleware/auth.js';
import { logActivity } from '../utils/activity.js';
import { pairingLimiter } from '../middleware/rateLimit.js';

export const sessionRouter = Router();

const createSchema = z.object({
  deviceName: z.string().min(1).max(64),
  deviceType: z.enum(['desktop', 'mobile', 'tablet', 'unknown']).default('unknown'),
  publicKeyJwk: z.string().max(2000).optional(),
});

// Host creates a new pairing session. Returns the one-time code, QR token,
// and a scoped device token for the host itself.
sessionRouter.post('/', pairingLimiter, (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
  const { deviceName, deviceType, publicKeyJwk } = parsed.data;

  const now = nowMs();
  const sessionId = nanoid();
  const deviceId = nanoid();
  const code = generatePairingCode();
  const qrToken = generateQrToken();

  db.prepare(
    `INSERT INTO sessions (id, code_hash, qr_token_hash, status, created_at, expires_at, pairing_expires_at, last_activity_at)
     VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)`
  ).run(
    sessionId,
    sha256(code),
    sha256(qrToken),
    now,
    now + config.sessionTtlMinutes * 60_000,
    now + config.pairingTtlMinutes * 60_000,
    now
  );

  db.prepare(
    `INSERT INTO devices (id, session_id, device_name, device_type, is_host, public_key_jwk, joined_at, last_seen_at, status)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?, 'connected')`
  ).run(deviceId, sessionId, deviceName, deviceType, publicKeyJwk || null, now, now);

  logActivity(sessionId, deviceId, 'session_created', `host="${deviceName}"`);

  const token = signDeviceToken({ sessionId, deviceId, isHost: true });

  res.status(201).json({
    sessionId,
    deviceId,
    token,
    pairingCode: code,
    qrToken,
    expiresAt: now + config.sessionTtlMinutes * 60_000,
    pairingExpiresAt: now + config.pairingTtlMinutes * 60_000,
  });
});

// End session explicitly (host-initiated or any device leaving triggers
// cleanup only for itself; only the host can end the whole session).
sessionRouter.post('/end', requireAuth, (req, res) => {
  const { sessionId, isHost } = req.auth;
  if (!isHost) return res.status(403).json({ error: 'host_only' });

  const now = nowMs();
  db.prepare(`UPDATE sessions SET status='ended', ended_at=?, ended_reason='manual' WHERE id=?`)
    .run(now, sessionId);
  logActivity(sessionId, req.auth.deviceId, 'session_ended', 'ended_by_host');

  // Purge all application-managed data for this session (cascades to
  // devices/transfers/activity via ON DELETE CASCADE). We keep the session
  // row itself only long enough to answer this response with status; a
  // background sweep will hard-delete it shortly after.
  res.json({ ok: true });

  // Hard delete on next tick so the response above still has valid data.
  setImmediate(() => {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  });
});

// Poll session status/metadata (used by clients to show countdowns etc.)
sessionRouter.get('/me', requireAuth, (req, res) => {
  const s = req.session_;
  res.json({
    sessionId: s.id,
    status: s.status,
    expiresAt: s.expires_at,
    createdAt: s.created_at,
    isHost: req.auth.isHost,
  });
});
