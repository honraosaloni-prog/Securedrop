-- SecureDrop schema
-- Design notes:
--  * No file content is ever stored here. Files travel peer-to-peer over
--    encrypted WebRTC DataChannels. Only metadata (name/size/status) is
--    logged transiently for activity history, and it is deleted when a
--    session ends.
--  * All timestamps are unix epoch milliseconds (UTC).
--  * ON DELETE CASCADE ensures that ending/expiring a session purges every
--    related row (devices, transfers, activity, pairing codes).

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,        -- session id (nanoid)
  code_hash       TEXT NOT NULL,           -- sha256 of one-time pairing code
  qr_token_hash   TEXT NOT NULL,           -- sha256 of QR pairing token
  status          TEXT NOT NULL DEFAULT 'pending', -- pending|active|ended|expired
  created_at      INTEGER NOT NULL,
  expires_at      INTEGER NOT NULL,        -- hard session TTL
  pairing_expires_at INTEGER NOT NULL,     -- pairing code/QR TTL
  last_activity_at INTEGER NOT NULL,
  ended_at        INTEGER,
  ended_reason    TEXT                     -- manual|expired|inactivity|remote_disconnect
);

CREATE TABLE IF NOT EXISTS devices (
  id              TEXT PRIMARY KEY,        -- device id (nanoid)
  session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  device_name     TEXT NOT NULL,
  device_type     TEXT NOT NULL,           -- desktop|mobile|tablet|unknown
  is_host         INTEGER NOT NULL DEFAULT 0,
  public_key_jwk  TEXT,                    -- ECDH public key for E2E key exchange
  joined_at       INTEGER NOT NULL,
  last_seen_at    INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'connected' -- connected|disconnected|removed
);

CREATE TABLE IF NOT EXISTS transfers (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  sender_device_id   TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  receiver_device_id TEXT REFERENCES devices(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,           -- file|photo|note|clipboard
  name            TEXT,                    -- filename or short label (metadata only)
  size_bytes      INTEGER,
  status          TEXT NOT NULL DEFAULT 'initiated', -- initiated|in_progress|completed|failed|rejected
  created_at      INTEGER NOT NULL,
  completed_at    INTEGER
);

CREATE TABLE IF NOT EXISTS activity_log (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  device_id       TEXT REFERENCES devices(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,           -- session_created|device_joined|device_removed|transfer_*|session_ended|...
  detail          TEXT,                    -- short human-readable, no sensitive payloads
  created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_devices_session ON devices(session_id);
CREATE INDEX IF NOT EXISTS idx_transfers_session ON transfers(session_id);
CREATE INDEX IF NOT EXISTS idx_activity_session ON activity_log(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
