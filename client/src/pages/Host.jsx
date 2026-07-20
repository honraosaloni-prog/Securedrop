import { useEffect, useState } from 'react';
import { api, setAuthToken } from '../api/client.js';
import { generateKeyPair } from '../crypto/e2ee.js';
import { detectDevice } from '../utils/device.js';
import { QRCodeDisplay } from '../components/QRCode.jsx';
import { SessionRoom } from './SessionRoom.jsx';

export function Host({ onBack }) {
  const [state, setState] = useState('creating'); // creating | pending | active | error
  const [session, setSession] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const device = detectDevice();
        const keyPair = await generateKeyPair();
        const res = await api.createSession({
          deviceName: device.name,
          deviceType: device.type,
          publicKeyJwk: JSON.stringify(keyPair.publicKeyJwk),
        });
        if (cancelled) return;
        setAuthToken(res.token);
        setSession({ ...res, keyPair, deviceName: device.name });
        setState('pending');
      } catch (e) {
        setErrorMsg('Could not start a session. Check your connection and try again.');
        setState('error');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (state !== 'pending' || !session) return;
    let stop = false;
    const id = setInterval(async () => {
      try {
        const { devices } = await api.listDevices();
        if (stop) return;
        if (devices.some((d) => !d.is_host && d.status === 'connected')) {
          setState('active');
        }
      } catch { /* ignore transient errors while waiting */ }
    }, 1500);
    return () => { stop = true; clearInterval(id); };
  }, [state, session]);

  if (state === 'creating') {
    return <div className="page page--center"><p className="mono">Preparing a secure session…</p></div>;
  }
  if (state === 'error') {
    return (
      <div className="page page--center">
        <div className="card landing">
          <p>{errorMsg}</p>
          <button className="btn" onClick={onBack}>Back</button>
        </div>
      </div>
    );
  }

  if (state === 'active') {
    return (
      <SessionRoom
        token={session.token}
        sessionId={session.sessionId}
        deviceId={session.deviceId}
        isHost
        expiresAt={session.expiresAt}
        totalTtlMs={session.expiresAt - Date.now()}
        myKeyPair={session.keyPair}
        initialPeer={null}
        deviceName={session.deviceName}
        onExit={onBack}
      />
    );
  }

  const qrPayload = JSON.stringify({ sessionId: session.sessionId, qrToken: session.qrToken });

  return (
    <div className="page page--center">
      <div className="card pairing">
        <span className="eyebrow">Waiting for the other device</span>
        <h2>Scan or enter this on your other device</h2>

        <div className="pairing__qr">
          <QRCodeDisplay value={qrPayload} />
        </div>

        <div className="pairing__code">
          <span className="label">One-time code</span>
          <span className="pairing__code-value mono">{session.pairingCode}</span>
        </div>

        <p className="pairing__hint">
          Open SecureDrop on the other device, choose <strong>Join a session</strong>, and enter this
          code or scan the QR. This code expires in {Math.round((session.pairingExpiresAt - Date.now()) / 60000)} minutes.
        </p>

        <button className="btn btn-ghost" onClick={onBack}>Cancel</button>
      </div>
    </div>
  );
}
