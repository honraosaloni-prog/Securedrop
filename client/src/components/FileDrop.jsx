import { useCallback, useRef, useState } from 'react';

function formatBytes(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileDrop({ onSendFiles, channelOpen, outgoing, incoming }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const handleFiles = useCallback((fileList) => {
    const files = Array.from(fileList || []);
    if (files.length) onSendFiles(files);
  }, [onSendFiles]);

  return (
    <div className="card filedrop">
      <div
        className={`filedrop__zone ${dragOver ? 'filedrop__zone--over' : ''} ${!channelOpen ? 'filedrop__zone--disabled' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (channelOpen) handleFiles(e.dataTransfer.files);
        }}
        onClick={() => channelOpen && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-disabled={!channelOpen}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
        <p className="filedrop__hint">
          {channelOpen
            ? 'Drop files here, or tap to choose files / photos / documents'
            : 'Waiting for the encrypted link to connect…'}
        </p>
        <p className="filedrop__note mono">Sent directly, device to device — never stored on a server</p>
      </div>

      {(outgoing.length > 0 || incoming.length > 0) && (
        <ul className="filedrop__transfers">
          {outgoing.map((t) => (
            <li key={t.id} className="filedrop__transfer">
              <span className="filedrop__transfer-name">↑ {t.name}</span>
              <span className="filedrop__transfer-progress mono">
                {t.status === 'completed' ? 'Sent' : `${formatBytes(t.sent)} / ${formatBytes(t.size)}`}
              </span>
            </li>
          ))}
          {incoming.map((t) => (
            <li key={t.id} className="filedrop__transfer">
              <span className="filedrop__transfer-name">↓ {t.name}</span>
              {t.status === 'completed' ? (
                <a className="filedrop__download" href={t.url} download={t.name}>Save</a>
              ) : (
                <span className="filedrop__transfer-progress mono">
                  {formatBytes(t.received)} / {formatBytes(t.size)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
