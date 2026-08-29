SecureDrop

A browser-to-browser secure temporary workspace. Pair two devices with a QR code or one-time code, then move files, photos, documents, notes, and clipboard text directly between them — end-to-end encrypted, peer-to-peer. The server relays pairing and WebRTC signaling only; it never sees file contents, notes, or clipboard text in plaintext, and never stores them.
     
🔗 **[Live Demo]([https://datalens-mu.vercel.app](https://securedrop-8hje.onrender.com/ ))**

How it works
Host opens SecureDrop and starts a session. The server issues a short-lived pairing code + QR token and a scoped JWT for that device.
Guest opens SecureDrop on the second device and enters the code (or scans the QR). The server validates it, pairs the two devices to one session, and returns a scoped JWT for the guest.
Both browsers exchange ECDH public keys (carried in the pairing metadata) and independently derive an identical AES-256-GCM key — the server never has this key.
The browsers open a WebRTC DataChannel directly to each other. The server only relays the SDP offer/answer/ICE candidates needed to establish that connection, and exposes a /api/ice-servers endpoint that fetches fresh, short-lived TURN credentials from Twilio on demand (server-side only — Twilio's account credentials never reach the browser), so the connection reliably completes even behind restrictive NATs/firewalls.
Every file chunk, note, and clipboard payload is encrypted with the shared key before it leaves the browser.
Either device can end the session, remove the other device, or let it expire. Ending a session deletes all session rows (devices, transfer metadata, activity log) from the database and tells both browsers to drop their in-memory state.
Tech stack

Backend: Node.js 22+ (node:sqlite), Express, Socket.IO, JWT, zod, helmet, express-rate-limit

Frontend: React 18, Vite, native WebRTC APIs, native WebCrypto API (ECDH + AES-GCM), qrcode, socket.io-client

Infra: Single combined service on Railway (server serves the built client, same-origin, no CORS to manage), Twilio Network Traversal Service for TURN

Screenshots
<img width="1365" height="730" alt="output1" src="https://github.com/user-attachments/assets/5dc7e8cb-f501-494e-8213-852eb57df2e0" /> <img width="1365" height="658" alt="output2" src="https://github.com/user-attachments/assets/51165998-18db-4822-88b6-742cbc21b8a5" /> <img width="1343" height="654" alt="Untitled picture" src="https://github.com/user-attachments/assets/204d04b8-226d-4df3-aca3-d5aae292af3a" />
Project structure
securedrop/
  package.json       Root build/start scripts — drives the deployed single-service build
  server/            Node.js + Express + Socket.IO signaling & session API
    src/
      db/             SQLite schema + connection (Node's built-in node:sqlite)
      middleware/      Zero-Trust auth guard, rate limiting
      routes/          sessions, devices, transfers, activity, ice-servers
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
Running it locally

Requires Node.js 22.5+ (the server uses Node's built-in node:sqlite, so there is nothing to compile).

Terminal 1 — server:

cd server
cp .env.example .env      # edit JWT_SECRET before any real deployment
npm install
npm start                 # listens on :4000

Terminal 2 — client:

cd client
cp .env.example .env      # point VITE_API_URL at your server if not local
npm install
npm run dev                # http://localhost:5173

To pair a phone and a computer on the same Wi-Fi network during development: uncomment host: '0.0.0.0' in client/vite.config.js, set CLIENT_ORIGIN in server/.env to http://<your-lan-ip>:5173, and open http://<your-lan-ip>:5173 on the phone.

Deployment

Deployed as a single combined service on Railway — the Express server serves the built React client directly from the same origin (no CORS, no separate frontend host to keep in sync). The root package.json drives the build:

"scripts": {
  "build": "cd client && npm install && npm run build && cd ../server && npm install",
  "start": "cd server && npm start"
}

Required environment variables in production:

JWT_SECRET=<long random string>
SESSION_TTL_MINUTES=15
PAIRING_TTL_MINUTES=5
INACTIVITY_TIMEOUT_MINUTES=5
DB_PATH=./data/securedrop.db
TWILIO_ACCOUNT_SID=<your Twilio Account SID>
TWILIO_AUTH_TOKEN=<your Twilio Auth Token>

TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN power /api/ice-servers (server/src/routes/ice.js), which requests a fresh TURN credential from Twilio's Network Traversal Service on every session rather than hardcoding one that would eventually expire.

Production notes
Set a strong random JWT_SECRET — the server refuses to boot with the placeholder value once NODE_ENV=production.
HTTPS/WSS is required in practice — Railway (and most PaaS hosts) provide this automatically.
The SQLite file is small and ephemeral by design (rows are deleted when sessions end or expire) — the app's intent is that nothing outlives the session.
Rotate TWILIO_AUTH_TOKEN periodically via Twilio's secondary-token flow (request secondary → update the env var → promote to primary) so credentials are never long-lived in one place.
Known limitations
Same-WiFi pairing can occasionally be affected by router-level AP/Client Isolation settings — not an app bug; cross-network pairing (the more realistic use case) is unaffected.
1 host + 1 guest per session by design, to keep the trust model simple.
QR scanning uses the browser BarcodeDetector API where available and falls back to manual code entry elsewhere.

See ARCHITECTURE.md for the full security design write-up.
##ScreenShot
<img width="1365" height="730" alt="output1" src="https://github.com/user-attachments/assets/5dc7e8cb-f501-494e-8213-852eb57df2e0" />
<img width="1365" height="658" alt="output2" src="https://github.com/user-attachments/assets/51165998-18db-4822-88b6-742cbc21b8a5" />
<img width="1343" height="654" alt="Untitled picture" src="https://github.com/user-attachments/assets/204d04b8-226d-4df3-aca3-d5aae292af3a" />




