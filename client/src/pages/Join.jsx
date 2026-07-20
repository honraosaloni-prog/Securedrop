import { useEffect, useRef, useState } from 'react';
import { api, setAuthToken } from '../api/client.js';
import { generateKeyPair } from '../crypto/e2ee.js';
import { detectDevice } from '../utils/device.js';
import { SessionRoom } from './SessionRoom.jsx';

export function Join({ onBack }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [session, setSession] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanSupported, setScanSupported] = useState('BarcodeDetector' in window);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  async function doJoin({ pairingCode, qrToken }) {
    setBusy(true);
    setErrorMsg(null);
    try {
      const device = detectDevice();
      const keyPair = await generateKeyPair();
      const res = await api.joinSession({
        deviceName: device.name,
        deviceType: device.type,
        publicKeyJwk: JSON.stringify(keyPair.publicKeyJwk),
        pairingCode,
        qrToken,
      });
      setAuthToken(res.token);
      setSession({ ...res, keyPair, deviceName: device.name });
    } catch (e) {
      if (e.status === 404) setErrorMsg('That code is invalid or has expired.');
      else if (e.status === 409) setErrorMsg('That session already has a paired device.');
      else setErrorMsg('Could not join. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  function submitCode(e) {
    e.preventDefault();
    if (code.trim().length !== 6) {
      setErrorMsg('Enter the 6-digit code shown on the other device.');
      return;
    }
    doJoin({ pairingCode: code.trim() });
  }

  async function startScan() {
    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      const tick = async () => {
        if (!streamRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes.length > 0) {
            const parsed = JSON.parse(codes[0].rawValue);
            stopScan();
            doJoin({ qrToken: parsed.qrToken });
            return;
          }
        } catch { /* keep scanning */ }
        if (streamRef.current) requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setErrorMsg('Camera access was blocked. Enter the 6-digit code instead.');
      setScanning(false);
    }
  }

  function stopScan() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }

  useEffect(() => () => stopScan(), []);

  if (session) {
    return (
      <SessionRoom
        token={session.token}
        sessionId={session.sessionId}
        deviceId={session.deviceId}
        isHost={false}
        expiresAt={session.expiresAt}
        totalTtlMs={session.expiresAt - Date.now()}
        myKeyPair={session.keyPair}
        initialPeer={session.peer}
        deviceName={session.deviceName}
        onExit={onBack}
      />
    );
  }

  return (
    <div className="page page--center">
      <div className="card pairing">
        <span className="eyebrow">Join a session</span>
        <h2>Enter the code from your other device</h2>

        <form onSubmit={submitCode} className="join-form">
          <input
            className="input join-form__code"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            autoFocus
          />
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Joining…' : 'Join'}
          </button>
        </form>

        {scanSupported && !scanning && (
          <button className="btn btn-ghost" onClick={startScan}>Scan QR code instead</button>
        )}

        {scanning && (
          <div className="join-scan">
            <video ref={videoRef} className="join-scan__video" muted playsInline />
            <button className="btn btn-ghost" onClick={stopScan}>Cancel scan</button>
          </div>
        )}

        {errorMsg && <p className="join-error">{errorMsg}</p>}

        <button className="btn btn-ghost" onClick={onBack}>Back</button>
      </div>
    </div>
  );
}
