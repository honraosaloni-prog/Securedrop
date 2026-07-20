import { verifyDeviceToken } from '../utils/tokens.js';
import { db, nowMs } from '../db/db.js';
import { logActivity } from '../utils/activity.js';

/**
 * The socket layer ONLY relays WebRTC signaling (SDP offers/answers, ICE
 * candidates) and lightweight presence/control events. No file bytes and
 * no plaintext application data ever pass through the server — that all
 * flows peer-to-peer over the resulting encrypted DataChannel.
 */
export function attachSignaling(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    const payload = token ? verifyDeviceToken(token) : null;
    if (!payload) return next(new Error('unauthorized'));

    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(payload.sid);
    if (!session || session.status !== 'active' || session.expires_at < nowMs()) {
      return next(new Error('session_not_active'));
    }
    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND session_id = ?')
      .get(payload.did, payload.sid);
    if (!device || device.status !== 'connected') {
      return next(new Error('device_not_connected'));
    }

    socket.data.sessionId = payload.sid;
    socket.data.deviceId = payload.did;
    socket.data.isHost = !!payload.host;
    next();
  });

  io.on('connection', (socket) => {
    const room = socket.data.sessionId;
    socket.join(room);
    socket.to(room).emit('peer:online', { deviceId: socket.data.deviceId });

    socket.on('signal', (msg) => {
      // msg: { type: 'offer'|'answer'|'ice', payload }
      socket.to(room).emit('signal', { from: socket.data.deviceId, ...msg });
    });

    socket.on('clipboard:push', (msg) => {
      // msg: { ciphertext, iv } — end-to-end encrypted by the sender using
      // the shared ECDH-derived key; the server relays opaque bytes only.
      socket.to(room).emit('clipboard:push', { from: socket.data.deviceId, ...msg });
    });

    socket.on('session:remote-disconnect', () => {
      if (!socket.data.isHost) return;
      const now = nowMs();
      db.prepare(`UPDATE sessions SET status='ended', ended_at=?, ended_reason='remote_disconnect' WHERE id=?`)
        .run(now, room);
      logActivity(room, socket.data.deviceId, 'session_ended', 'remote_disconnect_by_host');
      io.to(room).emit('session:ended', { reason: 'remote_disconnect' });
      setImmediate(() => db.prepare('DELETE FROM sessions WHERE id = ?').run(room));
    });

    socket.on('disconnect', () => {
      socket.to(room).emit('peer:offline', { deviceId: socket.data.deviceId });
    });
  });
}
