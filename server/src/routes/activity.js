import { Router } from 'express';
import { db } from '../db/db.js';
import { requireAuth } from '../middleware/auth.js';

export const activityRouter = Router();

activityRouter.get('/', requireAuth, (req, res) => {
  const rows = db.prepare(
    `SELECT a.id, a.action, a.detail, a.created_at, d.device_name
     FROM activity_log a LEFT JOIN devices d ON d.id = a.device_id
     WHERE a.session_id = ? ORDER BY a.created_at DESC LIMIT 200`
  ).all(req.auth.sessionId);
  res.json({ activity: rows });
});
