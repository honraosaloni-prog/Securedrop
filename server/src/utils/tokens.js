import jwt from 'jsonwebtoken';
import { config } from '../config.js';

/**
 * Device tokens are short-lived and scoped to exactly one session + one
 * device id. They are never valid for any other session (Zero-Trust:
 * every request re-verifies scope, not just signature validity).
 */
export function signDeviceToken({ sessionId, deviceId, isHost }) {
  return jwt.sign(
    { sid: sessionId, did: deviceId, host: !!isHost },
    config.jwtSecret,
    { expiresIn: `${config.sessionTtlMinutes}m` }
  );
}

export function verifyDeviceToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
}
