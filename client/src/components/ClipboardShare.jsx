import { useState } from 'react';

export function ClipboardShare({ onSend, channelOpen, received }) {
  const [status, setStatus] = useState(null);

  async function sendClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) { setStatus('Clipboard is empty'); return; }
      onSend(text);
      setStatus('Sent');
    } catch {
      setStatus('Clipboard access was blocked — check browser permissions');
    }
    setTimeout(() => setStatus(null), 3000);
  }

  async function copyReceived(text) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus('Copied to your clipboard');
    } catch {
      setStatus('Could not access clipboard');
    }
    setTimeout(() => setStatus(null), 3000);
  }

  return (
    <div className="card clipboard">
      <span className="label">Clipboard</span>
      <button className="btn" onClick={sendClipboard} disabled={!channelOpen}>
        Send my clipboard
      </button>
      {status && <p className="clipboard__status mono">{status}</p>}
      {received.length > 0 && (
        <ul className="clipboard__received">
          {received.map((r, i) => (
            <li key={i} className="clipboard__item">
              <p className="clipboard__text">{r.text}</p>
              <button className="btn btn-ghost" onClick={() => copyReceived(r.text)}>Copy</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
