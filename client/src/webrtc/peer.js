import { io } from 'socket.io-client';
import {
  generateKeyPair,
  importPeerPublicKey,
  deriveSharedKey,
  encryptBytes,
  decryptBytes,
  encryptText,
  decryptText,
} from '../crypto/e2ee.js';

const ICE_SERVERS = [
  { urls: 'stun:global.stun.twilio.com:3478' },
  {
    urls: 'turn:global.turn.twilio.com:3478?transport=udp',
    username: '676d39209efa1401e61ebd4fee5fcd4d3d6d8eac315cfb22b250a5b76d32221b',
    credential: 'tM/6Z94E0U55VQopkVzmDTn3+m0PnDJ4yDvQ9rCsHUs=',
  },
  {
    urls: 'turn:global.turn.twilio.com:3478?transport=tcp',
    username: '676d39209efa1401e61ebd4fee5fcd4d3d6d8eac315cfb22b250a5b76d32221b',
    credential: 'tM/6Z94E0U55VQopkVzmDTn3+m0PnDJ4yDvQ9rCsHUs=',
  },
  {
    urls: 'turn:global.turn.twilio.com:443?transport=tcp',
    username: '676d39209efa1401e61ebd4fee5fcd4d3d6d8eac315cfb22b250a5b76d32221b',
    credential: 'tM/6Z94E0U55VQopkVzmDTn3+m0PnDJ4yDvQ9rCsHUs=',
  },
];
const CHUNK_SIZE = 64 * 1024; // 64KB
const BUFFERED_AMOUNT_LOW_THRESHOLD = 1 * 1024 * 1024; // 1MB

export function createSecureDropPeer({ apiBase, token, isHost, myPublicKeyJwk, myPrivateKey }) {
  const listeners = {
    peerConnected: [],
    peerDisconnected: [],
    channelOpen: [],
    channelClosed: [],
    fileProgress: [],
    fileReceived: [],
    noteReceived: [],
    clipboardReceived: [],
    sessionEnded: [],
  };

  function on(event, cb) {
    listeners[event]?.push(cb);
    return () => {
      listeners[event] = listeners[event].filter((f) => f !== cb);
    };
  }
  function emit(event, payload) {
    (listeners[event] || []).forEach((cb) => cb(payload));
  }

  let socket;
  let pc;
  let channel;
  let sharedKey = null;
  const incoming = new Map();

  function connectSocket() {
    socket = io(apiBase, { auth: { token } });

    socket.on('connect_error', (err) => {
      console.error('Signaling connection failed:', err.message);
    });

    socket.on('peer:online', () => {
      if (isHost) createOffer();
    });

    socket.on('signal', async ({ type, payload }) => {
      if (type === 'offer') {
        await ensurePeerConnection();
        await pc.setRemoteDescription(payload);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('signal', { type: 'answer', payload: pc.localDescription });
      } else if (type === 'answer') {
        await pc.setRemoteDescription(payload);
      } else if (type === 'ice') {
        try {
          await pc.addIceCandidate(payload);
        } catch (e) {
          console.warn('addIceCandidate failed', e);
        }
      }
    });

    socket.on('session:ended', (data) => emit('sessionEnded', data));
    socket.on('peer:offline', () => emit('peerDisconnected'));
  }

  async function ensurePeerConnection() {
    if (pc && pc.signalingState !== 'closed') return;
    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('signal', { type: 'ice', payload: e.candidate });
    };

    pc.onconnectionstatechange = () => {
      console.log('connectionState:', pc.connectionState);
      if (pc.connectionState === 'connected') emit('peerConnected');
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        emit('peerDisconnected');
      }
    };

    if (isHost) {
      channel = pc.createDataChannel('securedrop', { ordered: true });
      wireChannel(channel);
    } else {
      pc.ondatachannel = (e) => {
        channel = e.channel;
        wireChannel(channel);
      };
    }
  }

  async function createOffer() {
    await ensurePeerConnection();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('signal', { type: 'offer', payload: pc.localDescription });
  }

  function wireChannel(ch) {
    ch.binaryType = 'arraybuffer';
    ch.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW_THRESHOLD;
    ch.onopen = () => emit('channelOpen');
    ch.onclose = () => emit('channelClosed');
    ch.onmessage = (e) => handleMessage(e.data);
  }

  async function handleMessage(data) {
    if (typeof data === 'string') {
      const msg = JSON.parse(data);
      if (msg.type === 'file-meta') {
        incoming.set(msg.transferId, { meta: msg, chunks: [], received: 0 });
      } else if (msg.type === 'chunk-meta') {
        incoming.get(msg.transferId)._expectedIndex = msg.index;
      } else if (msg.type === 'file-end') {
        const entry = incoming.get(msg.transferId);
        if (!entry) return;
        const blob = new Blob(entry.chunks, { type: entry.meta.mime || 'application/octet-stream' });
        emit('fileReceived', { ...entry.meta, blob });
        incoming.delete(msg.transferId);
      } else if (msg.type === 'note') {
        const text = await decryptText(sharedKey, base64ToBytes(msg.ciphertext));
        emit('noteReceived', { id: msg.id, text, at: Date.now() });
      } else if (msg.type === 'clipboard') {
        const text = await decryptText(sharedKey, base64ToBytes(msg.ciphertext));
        emit('clipboardReceived', { text, at: Date.now() });
      }
      return;
    }

    const entry = [...incoming.values()].find((e) => e._expectedIndex !== undefined);
    if (!entry) return;
    const plain = await decryptBytes(sharedKey, new Uint8Array(data));
    entry.chunks.push(plain);
    entry.received += plain.byteLength;
    delete entry._expectedIndex;
    emit('fileProgress', {
      transferId: entry.meta.transferId,
      name: entry.meta.name,
      received: entry.received,
      size: entry.meta.size,
      direction: 'in',
    });
  }

  async function waitForBufferDrain() {
    if (channel.bufferedAmount <= BUFFERED_AMOUNT_LOW_THRESHOLD) return;
    await new Promise((resolve) => {
      const handler = () => {
        channel.removeEventListener('bufferedamountlow', handler);
        resolve();
      };
      channel.addEventListener('bufferedamountlow', handler);
    });
  }

  async function sendFile(file, { kind = 'file', transferId } = {}) {
    if (!channel || channel.readyState !== 'open') throw new Error('channel_not_open');
    if (!sharedKey) throw new Error('no_shared_key');

    channel.send(JSON.stringify({
      type: 'file-meta', transferId, kind, name: file.name, size: file.size, mime: file.type,
    }));

    let index = 0;
    let offset = 0;
    while (offset < file.size) {
      const slice = file.slice(offset, offset + CHUNK_SIZE);
      const buf = await slice.arrayBuffer();
      const encrypted = await encryptBytes(sharedKey, buf);

      await waitForBufferDrain();
      channel.send(JSON.stringify({ type: 'chunk-meta', transferId, index }));
      channel.send(encrypted.buffer);

      offset += buf.byteLength;
      index += 1;
      emit('fileProgress', { transferId, name: file.name, sent: offset, size: file.size, direction: 'out' });
    }
    channel.send(JSON.stringify({ type: 'file-end', transferId }));
  }

  async function sendNote(text, id) {
    if (!channel || channel.readyState !== 'open') throw new Error('channel_not_open');
    const enc = await encryptText(sharedKey, text);
    channel.send(JSON.stringify({ type: 'note', id, ciphertext: bytesToBase64(enc) }));
  }

  async function sendClipboard(text) {
    if (!channel || channel.readyState !== 'open') throw new Error('channel_not_open');
    const enc = await encryptText(sharedKey, text);
    channel.send(JSON.stringify({ type: 'clipboard', ciphertext: bytesToBase64(enc) }));
  }

  async function setPeerPublicKey(jwk) {
    const peerPublicKey = await importPeerPublicKey(jwk);
    sharedKey = await deriveSharedKey(myPrivateKey, peerPublicKey);
  }

  function notifyRemoteDisconnect() {
    socket?.emit('session:remote-disconnect');
  }

  function close() {
    channel?.close();
    pc?.close();
    socket?.disconnect();
    channel = null;
    pc = null;
    socket = null;
  }

  return {
    on,
    connectSocket,
    setPeerPublicKey,
    sendFile,
    sendNote,
    sendClipboard,
    notifyRemoteDisconnect,
    close,
    get isChannelOpen() {
      return !!channel && channel.readyState === 'open';
    },
  };
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
