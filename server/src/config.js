import 'dotenv/config';
import crypto from 'node:crypto';

function requireSecret() {
  const s = process.env.JWT_SECRET;
  if (!s || s === 'change-me-to-a-random-64-byte-hex-string') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must be set to a strong random value in production');
    }
    // Dev fallback only — never used in production because of the throw above.
    return crypto.randomBytes(48).toString('hex');
  }
  return s;
}

export const config = {
  port: Number(process.env.PORT || 4000),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  jwtSecret: requireSecret(),
  sessionTtlMinutes: Number(process.env.SESSION_TTL_MINUTES || 15),
  pairingTtlMinutes: Number(process.env.PAIRING_TTL_MINUTES || 5),
  inactivityTimeoutMinutes: Number(process.env.INACTIVITY_TIMEOUT_MINUTES || 5),
  dbPath: process.env.DB_PATH || './data/securedrop.db',
};
