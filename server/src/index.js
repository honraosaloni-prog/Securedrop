import express from 'express';
import http from 'node:http';
import cors from 'cors';
import helmet from 'helmet';
import { Server } from 'socket.io';
import { config } from './config.js';
import { sessionRouter } from './routes/session.js';
import { deviceRouter } from './routes/device.js';
import { transferRouter } from './routes/transfer.js';
import { activityRouter } from './routes/activity.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { attachSignaling } from './sockets/signaling.js';
import { startCleanupJob } from './jobs/cleanup.js';
import './db/db.js'; // initialize schema on boot
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { iceRouter } from './routes/ice.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(express.json({ limit: '64kb' })); // metadata only — never file bytes
app.use(apiLimiter);

app.get('/health', (_req, res) => res.json({ ok: true, time: Date.now() }));

app.use('/api/sessions', sessionRouter);
app.use('/api/devices', deviceRouter);
app.use('/api/transfers', transferRouter);
app.use('/api/activity', activityRouter);
app.use('/api/ice-servers', iceRouter);
// Serve the built React client from the same server + same origin.
// Removes CORS entirely — one deployment, one URL.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path === '/health') return next();
  res.sendFile(path.join(clientDist, 'index.html'));
});

// Generic error handler — never leak stack traces to clients.
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: config.clientOrigin, credentials: true },
  maxHttpBufferSize: 1e5, // signaling messages only, keep small
});

attachSignaling(io);
const stopCleanup = startCleanupJob(io);

server.listen(config.port, () => {
  console.log(`SecureDrop server listening on :${config.port}`);
});

process.on('SIGTERM', () => {
  stopCleanup();
  server.close(() => process.exit(0));
});
