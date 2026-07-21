# SecureDrop

A browser-to-browser secure temporary workspace. Pair two devices with a QR
code or one-time code, then move files, photos, documents, notes, and
clipboard text directly between them — end-to-end encrypted, peer-to-peer.
The server relays pairing and WebRTC signaling only; it never sees file
contents, notes, or clipboard text in plaintext, and never stores them.


## How it works

1. **Host** opens SecureDrop and starts a session. The server issues a
   short-lived pairing code + QR token and a scoped JWT for that device.
2. **Guest** opens SecureDrop on the second device and enters the code (or
   scans the QR). The server validates it, pairs the two devices to one
   session, and returns a scoped JWT for the guest.
3. Both browsers exchange **ECDH public keys** (carried in the pairing
   metadata) and independently derive an identical **AES-256-GCM** key —
   the server never has this key.
4. The browsers open a **WebRTC DataChannel** directly to each other
   (the server only relays the SDP offer/answer/ICE candidates needed to
   establish that connection). Every file chunk, note, and clipboard
   payload sent over that channel is encrypted with the shared key before
   it leaves the browser.
5. Either device can end the session, remove the other device, or simply
   let it expire. Ending a session deletes all session rows (devices,
   transfer metadata, activity log) from the database and tells both
   browsers to drop their in-memory state.

## Project structure

```
securedrop/
  server/            Node.js + Express + Socket.IO signaling & session API
    src/
      db/             SQLite schema + connection (Node's built-in node:sqlite)
      middleware/      Zero-Trust auth guard, rate limiting
      routes/          sessions, devices, transfers, activity (REST)
      sockets/         WebRTC signaling relay (offer/answer/ICE only)
      utils/           crypto helpers, JWT helpers, activity logging
      jobs/            background expiry / inactivity sweep
  client/             React + Vite frontend
    src/
      crypto/          WebCrypto ECDH + AES-GCM (E2E encryption)
      webrtc/          RTCPeerConnection + encrypted DataChannel protocol
      api/             REST client
      pages/           Landing, Host, Join, SessionRoom
      components/      QR code, device list, file drop, notes, clipboard,
                        activity log, LinkBeam + CountdownRing (status UI)
  ARCHITECTURE.md      Security architecture, data model, threat model
```

## Running it locally

Requires **Node.js 22.5+** (the server uses Node's built-in `node:sqlite`,
so there is nothing to compile).

```bash
# Terminal 1 — server
cd server
cp .env.example .env      # edit JWT_SECRET before any real deployment
npm install
npm start                 # listens on :4000

# Terminal 2 — client
cd client
cp .env.example .env      # point VITE_API_URL at your server if not local
npm install
npm run dev                # http://localhost:5173
```

To pair a phone and a computer on the same Wi-Fi network during
development: uncomment `host: '0.0.0.0'` in `client/vite.config.js`, set
`CLIENT_ORIGIN` in `server/.env` to `http://<your-lan-ip>:5173`, and open
`http://<your-lan-ip>:5173` on the phone. WebRTC also needs HTTPS on real
networks with NAT/firewalls in the way — for anything beyond a local LAN
test, put both the client and server behind TLS (a reverse proxy like
Caddy/Nginx, or a host that provides HTTPS automatically) and add a TURN
server to `ICE_SERVERS` in `client/src/webrtc/peer.js` for reliable
connectivity across restrictive networks.

## Production notes

- Set a strong random `JWT_SECRET` (the server refuses to boot with the
  placeholder value once `NODE_ENV=production`).
- Put the server behind HTTPS/WSS — the QR/pairing flow and Zero-Trust
  tokens assume a trusted transport.
- Add a TURN server for reliable WebRTC connectivity outside simple LANs.
- The SQLite file is small and ephemeral by design (rows are deleted when
  sessions end or expire) — back it up like any other stateful service if
  you need durability of activity history beyond a session's lifetime,
  though the app's intent is that nothing outlives the session.

