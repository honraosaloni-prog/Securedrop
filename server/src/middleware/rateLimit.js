import rateLimit from 'express-rate-limit';

// Tight limiter for pairing endpoints — the main brute-force target
// (6-digit codes) — plus a general-purpose API limiter.
export const pairingLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_pairing_attempts' },
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited' },
});
