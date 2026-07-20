import { nanoid } from 'nanoid';
import { db, nowMs } from '../db/db.js';

export function logActivity(sessionId, deviceId, action, detail = null) {
  db.prepare(
    `INSERT INTO activity_log (id, session_id, device_id, action, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(nanoid(), sessionId, deviceId, action, detail, nowMs());
}
