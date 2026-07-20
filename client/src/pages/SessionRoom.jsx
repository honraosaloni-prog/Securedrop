import { useEffect, useMemo, useRef, useState } from 'react';
import { api, setAuthToken, API_BASE } from '../api/client.js';
import { createSecureDropPeer } from '../webrtc/peer.js';
import { LinkBeam } from '../components/LinkBeam.jsx';
import { CountdownRing } from '../components/CountdownRing.jsx';
import { DeviceList } from '../components/DeviceList.jsx';
import { FileDrop } from '../components/FileDrop.jsx';
import { Notes } from '../components/Notes.jsx';
import { ClipboardShare } from '../components/ClipboardShare.jsx';
import { ActivityLog } from '../components/ActivityLog.jsx';

export function SessionRoom({
  token, sessionId, deviceId, isHost, expiresAt, totalTtlMs,
  myKeyPair, initialPeer, deviceName, onExit,
}) {
  const [devices, setDevices] = useState([]);
  const [activity, setActivity] = useState([]);
  const [linkState, setLinkState] = useState('pairing'); // pairing | connected | ended
  const [peerLabel, setPeerLabel] = useState(initialPeer?.deviceName || 'Waiting…');
  const [outgoing, setOutgoing] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [notes, setNotes] = useState([]);
  const [clipboardReceived, setClipboardReceived] = useState([]);
  const [error, setError] = useState(null);
  const keyLinkedRef = useRef(!!initialPeer);

  const peer = useMemo(() => createSecureDropPeer({
    apiBase: API_BASE,
    token,
    isHost,
    myPublicKeyJwk: myKeyPair.publicKeyJwk,
    myPrivateKey: myKeyPair.privateKey,
  }), [token, isHost, myKeyPair]);

  useEffect(() => {
    setAuthToken(token);

    let cancelled = false;
    (async () => {
      if (initialPeer?.publicKeyJwk) {
        await peer.setPeerPublicKey(JSON.parse(initialPeer.publicKeyJwk));
      }
      if (cancelled) return;
      peer.connectSocket();
    })();

    const unsubs = [
      peer.on('channelOpen', () => setLinkState('connected')),
      peer.on('channelClosed', () => setLinkState('pairing')),
      peer.on('peerDisconnected', () => setLinkState((s) => (s === 'ended' ? s : 'pairing'))),
      peer.on('sessionEnded', () => {
        setLinkState('ended');
        onExit('ended');
      }),
      peer.on('fileProgress', (p) => {
        if (p.direction === 'out') {
          setOutgoing((prev) => upsert(prev, p.transferId, { id: p.transferId, name: p.name, sent: p.sent, size: p.size, status: p.sent >= p.size ? 'completed' : 'sending' }));
        } else {
          setIncoming((prev) => upsert(prev, p.transferId, { id: p.transferId, name: p.name, received: p.received, size: p.size, status: 'receiving' }));
        }
      }),
      peer.on('fileReceived', (f) => {
        const url = URL.createObjectURL(f.blob);
        setIncoming((prev) => upsert(prev, f.transferId, { id: f.transferId, name: f.name, size: f.size, status: 'completed', url }));
      }),
      peer.on('noteReceived', (n) => setNotes((prev) => [...prev, { ...n, direction: 'in' }])),
      peer.on('clipboardReceived', (c) => setClipboardReceived((prev) => [c, ...prev].slice(0, 5))),
    ];

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
      peer.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peer]);

  // Poll device list + activity, and pick up the peer's public key once it
  // joins (host doesn't know it until the second device appears).
  useEffect(() => {
    let stop = false;
    async function poll() {
      try {
        const [{ devices: d }, { activity: a }] = await Promise.all([
          api.listDevices(), api.listActivity(),
        ]);
        if (stop) return;
        setDevices(d);
        setError(null);

        const peerDevice = d.find((x) => x.id !== deviceId && x.status === 'connected');
        if (peerDevice) {
          setPeerLabel(peerDevice.device_name);
          if (!keyLinkedRef.current && peerDevice.public_key_jwk) {
            keyLinkedRef.current = true;
            await peer.setPeerPublicKey(JSON.parse(peerDevice.public_key_jwk));
          }
        } else if (linkState !== 'ended') {
          setPeerLabel('Waiting…');
        }
        setActivity(a);
      } catch (e) {
        if (e.status === 401) {
          setLinkState('ended');
          onExit('expired');
        } else {
          setError('Connection to server lost — retrying…');
        }
      }
    }
    poll();
    const id = setInterval(poll, 2500);
    return () => { stop = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peer]);

  async function handleSendFiles(files) {
    for (const file of files) {
      const transferId = crypto.randomUUID();
      setOutgoing((prev) => [...prev, { id: transferId, name: file.name, sent: 0, size: file.size, status: 'sending' }]);
      try {
        const { transferId: loggedId } = await api.createTransfer({ kind: 'file', name: file.name, sizeBytes: file.size });
        await peer.sendFile(file, { kind: 'file', transferId });
        await api.updateTransfer(loggedId, { status: 'completed' });
      } catch (e) {
        setOutgoing((prev) => upsert(prev, transferId, { id: transferId, name: file.name, status: 'failed' }));
      }
    }
  }

  async function handleSendNote(text) {
    const id = crypto.randomUUID();
    setNotes((prev) => [...prev, { id, text, direction: 'out', at: Date.now() }]);
    try {
      await peer.sendNote(text, id);
      await api.createTransfer({ kind: 'note' });
    } catch (e) { setError('Could not send note — link may be down'); }
  }

  async function handleSendClipboard(text) {
    try {
      await peer.sendClipboard(text);
      await api.createTransfer({ kind: 'clipboard' });
    } catch (e) { setError('Could not send clipboard — link may be down'); }
  }

  async function handleRemoveDevice(id) {
    try {
      await api.removeDevice(id);
      if (id === deviceId) onExit('left');
    } catch { /* device list poll will reconcile */ }
  }

  async function handleEndSession() {
    peer.notifyRemoteDisconnect();
    try { await api.endSession(); } catch { /* already ending */ }
    onExit('ended');
  }

  return (
    <div className="page">
      <header className="session-header">
        <div className="session-header__title">
          <span className="eyebrow">SecureDrop session</span>
          <h2>{deviceName} ↔ {peerLabel}</h2>
        </div>
        <div className="session-header__actions">
          <CountdownRing expiresAt={expiresAt} totalMs={totalTtlMs} />
          {isHost ? (
            <button className="btn btn-danger" onClick={handleEndSession}>End session</button>
          ) : (
            <button className="btn btn-danger" onClick={() => handleRemoveDevice(deviceId)}>Leave</button>
          )}
        </div>
      </header>

      <LinkBeam
        state={linkState === 'connected' ? 'connected' : 'pairing'}
        leftLabel={deviceName}
        rightLabel={peerLabel}
      />

      {error && <p className="session-error">{error}</p>}

      <div className="session-grid">
        <div className="session-grid__main">
          <FileDrop
            onSendFiles={handleSendFiles}
            channelOpen={linkState === 'connected'}
            outgoing={outgoing}
            incoming={incoming}
          />
          <Notes onSend={handleSendNote} channelOpen={linkState === 'connected'} notes={notes} />
          <ClipboardShare onSend={handleSendClipboard} channelOpen={linkState === 'connected'} received={clipboardReceived} />
        </div>
        <div className="session-grid__side">
          <DeviceList devices={devices} myDeviceId={deviceId} isHost={isHost} onRemove={handleRemoveDevice} />
          <ActivityLog items={activity} />
        </div>
      </div>
    </div>
  );
}

function upsert(list, id, patch) {
  const idx = list.findIndex((x) => x.id === id);
  if (idx === -1) return [...list, patch];
  const copy = [...list];
  copy[idx] = { ...copy[idx], ...patch };
  return copy;
}
