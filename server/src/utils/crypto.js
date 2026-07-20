import crypto from 'node:crypto';

/** SHA-256 hash, hex encoded. Used so raw pairing codes/tokens never sit in the DB. */
export function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/** Generate a human-typeable one-time pairing code, e.g. "482913" */
export function generatePairingCode() {
  const n = crypto.randomInt(0, 1_000_000);
  return n.toString().padStart(6, '0');
}

/** Generate a high-entropy token for the QR-code pairing path. */
export function generateQrToken() {
  return crypto.randomBytes(32).toString('base64url');
}

/** Constant-time string compare to avoid timing side-channels on code checks. */
export function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
