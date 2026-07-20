import { Router } from 'express';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { db, nowMs } from '../db/db.js';
import { requireAuth } from '../middleware/auth.js';
import { logActivity } from '../utils/activity.js';

export const transferRouter = Router();

// IMPORTANT: This router only ever stores metadata (kind/name/size/status).
// Actual file/photo/note/clipboard bytes travel directly between browsers
// over an encrypted WebRTC DataChannel and are never sent to the server.

const createSchema = z.object({
  kind: z.enum(['file', 'photo', 'note', 'clipboard']),
  name: z.string().max(256).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
});

transferRouter.post('/', requireAuth, (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
  const { kind, name, sizeBytes } = parsed.data;

  const id = nanoid();
  const now = nowMs();
  db.prepare(
    `INSERT INTO transfers (id, session_id, sender_device_id, kind, name, size_bytes, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'initiated', ?)`
  ).run(id, req.auth.sessionId, req.auth.deviceId, kind, name || null, sizeBytes ?? null, now);

  logActivity(req.auth.sessionId, req.auth.deviceId, `transfer_initiated`, `${kind}:${name || ''}`);
  res.status(201).json({ transferId: id });
});

const statusSchema = z.object({
  status: z.enum(['in_progress', 'completed', 'failed', 'rejected']),
});

transferRouter.patch('/:transferId', requireAuth, (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const row = db.prepare('SELECT * FROM transfers WHERE id = ? AND session_id = ?')
    .get(req.params.transferId, req.auth.sessionId);
  if (!row) return res.status(404).json({ error: 'transfer_not_found' });

  const now = nowMs();
  db.prepare(
    `UPDATE transfers SET status = ?, completed_at = CASE WHEN ? IN ('completed','failed','rejected') THEN ? ELSE completed_at END WHERE id = ?`
  ).run(parsed.data.status, parsed.data.status, now, row.id);

  logActivity(req.auth.sessionId, req.auth.deviceId, `transfer_${parsed.data.status}`, `${row.kind}:${row.name || ''}`);
  res.json({ ok: true });
});

transferRouter.get('/', requireAuth, (req, res) => {
  const rows = db.prepare(
    `SELECT id, kind, name, size_bytes, status, sender_device_id, created_at, completed_at
     FROM transfers WHERE session_id = ? ORDER BY created_at DESC LIMIT 200`
  ).all(req.auth.sessionId);
  res.json({ transfers: rows });
});
