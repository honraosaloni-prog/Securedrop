# SecureDrop — Architecture & Security Design

## 1. Trust model: Zero-Trust, session-scoped

Every API request and every socket connection carries a JWT that is scoped
to exactly one `(sessionId, deviceId)` pair and expires with the session
(`SESSION_TTL_MINUTES`, default 15). The auth middleware
(`server/src/middleware/auth.js`) does **not** trust the token alone:

1. Verify the JWT signature and expiry.
2. Re-check the session's live status in the database (`active`, not past
   `expires_at`).
3. Re-check the device's live status (`connected`, not `removed`).
4. Only then does the request proceed — and it refreshes `last_activity_at`
   / `last_seen_at` as it does, which is what powers the inactivity logout.

A token that is cryptographically valid but for a session that has since
ended, expired, or had its device removed is rejected. Nothing is trusted
purely because it was trusted a moment ago.

## 2. Pairing

- The host creates a session and receives a one-time 6-digit **pairing
  code** and a high-entropy **QR token**. Only their SHA-256 hashes are
  stored (`sessions.code_hash`, `sessions.qr_token_hash`) — the server
  never keeps the raw code at rest.
- The pairing window is short (`PAIRING_TTL_MINUTES`, default 5) and
  independent of the overall session TTL.
- Guest lookups compare hashes with `crypto.timingSafeEqual` to avoid
  timing side-channels, and pairing endpoints are rate-limited
  (`pairingLimiter`: 20 attempts / 5 minutes) to blunt brute-forcing a
  6-digit space.
- Exactly one non-host device may pair per session. This keeps the trust
  boundary to a clean 1:1 relationship and matches the "pair two devices"
  brief instead of allowing silent additional guests.

## 3. End-to-end encryption (server never sees plaintext)

- Each device generates a non-extractable **ECDH P-256** key pair locally
  (`client/src/crypto/e2ee.js`). Public keys ride along with the pairing
  metadata (create/join responses); private keys never leave the browser
  and are never marked extractable.
- Both browsers derive an identical **AES-256-GCM** key via
  ECDH → HKDF-SHA256. The server relays the public keys but has no path to
  the private keys or the derived key — it cannot decrypt anything even if
  fully compromised.
- Every file chunk, note, and clipboard payload is encrypted with that key
  (random 12-byte IV per message) *before* it is handed to the
  WebRTC DataChannel, which itself is already encrypted in transit via
  DTLS-SRTP. This is intentional belt-and-suspenders: the app-layer
  encryption means the guarantee doesn't depend on trusting the transport
  alone, and it also means the signaling/relay server (which only ever
  sees SDP/ICE, not data) has zero visibility into content even in
  principle.
- Large files are chunked (64KB) and streamed with backpressure
  (`bufferedamountlow`) so large transfers don't blow up browser memory or
  overrun the DataChannel buffer.

## 4. What the server actually stores

Only metadata, and only for the lifetime of the session:

| Table          | Contents                                              |
|----------------|--------------------------------------------------------|
| `sessions`     | hashed pairing code/token, status, TTL timestamps      |
| `devices`      | device name/type, ECDH **public** key, connection state|
| `transfers`    | kind/filename/size/status — never file bytes           |
| `activity_log` | short human-readable audit trail (who/what/when)       |

No file, photo, document, note, or clipboard **content** is ever sent to
the server or written to disk server-side. The `express.json()` body limit
(64KB) also acts as a structural guard against anyone trying to smuggle
payload data through the metadata APIs.

## 5. Session lifecycle & data deletion

- **Short-lived sessions**: hard TTL (`expires_at`) enforced both by the
  JWT expiry and by a re-check against the DB on every request.
- **Automatic logout / inactivity timeout**: a background sweep
  (`server/src/jobs/cleanup.js`, runs every 15s) ends any session whose
  `last_activity_at` is older than `INACTIVITY_TIMEOUT_MINUTES` (default
  5), plus any session whose pairing window lapsed with no second device.
- **Remote disconnect**: the host can force-end the session from the
  Socket.IO channel (`session:remote-disconnect`) or via
  `POST /api/sessions/end`; either path immediately flips the session to
  `ended` and broadcasts `session:ended` to both browsers.
- **Connected device management**: `GET /api/devices` lists devices with
  live status; `POST /api/devices/:id/remove` lets the host remove the
  peer, or any device remove itself ("Leave"). Removing the last connected
  device ends the session.
- **Invalidation + purge**: ending a session (by any of the paths above)
  sets `status='ended'`, then deletes the session row outright. Because
  every other table has `ON DELETE CASCADE` back to `sessions`, this
  cascades to delete every device, transfer-metadata, and activity-log row
  for that session in the same operation — so application-managed
  temporary data does not outlive the session, to the extent that's
  technically enforceable server-side. Clients additionally drop their
  in-memory keys, DataChannel, and any object URLs on `session:ended`.

## 6. Other hardening

- `helmet` for standard security headers; CORS locked to `CLIENT_ORIGIN`.
- General API rate limiting in addition to the pairing-specific limiter.
- Structured input validation (`zod`) on every mutating endpoint.
- Generic error responses — no stack traces or internals leak to clients.
- JWT secret is required to be a real random value in production
  (`config.js` throws rather than falling back to a placeholder).

## 7. Known limitations / what a real production rollout should add

- **TURN server**: plain STUN (`stun.l.google.com`) is enough for most
  direct/LAN connections but will fail behind symmetric NATs or strict
  corporate firewalls. Add a TURN server to `ICE_SERVERS` for reliability.
- **QR scanning** uses the browser `BarcodeDetector` API where available
  (recent Chrome/Edge/Android) and falls back to manual code entry
  elsewhere (e.g. current Safari/iOS) — a dedicated JS QR-decoding library
  would close that gap fully.
- **Multi-guest pairing** is intentionally out of scope (1 host + 1 guest)
  to keep the trust model simple; extending to group sessions would need
  a mesh or SFU topology and a richer permission model.
- **Persistent audit retention**: activity history is deleted with the
  session by design (matching the brief's "remove temporary data on
  session end"). If a deployment needs longer-lived compliance logs, add
  an explicit export step *before* the session ends, since the DB itself
  will not retain it after.
