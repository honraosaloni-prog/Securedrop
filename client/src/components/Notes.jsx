import { useState } from 'react';

export function Notes({ onSend, channelOpen, notes }) {
  const [text, setText] = useState('');

  function submit() {
    if (!text.trim() || !channelOpen) return;
    onSend(text.trim());
    setText('');
  }

  return (
    <div className="card notes">
      <span className="label">Notes</span>
      <div className="notes__list">
        {notes.length === 0 && <p className="notes__empty">No notes yet.</p>}
        {notes.map((n) => (
          <div key={n.id} className={`notes__item notes__item--${n.direction}`}>
            <p>{n.text}</p>
            <span className="notes__time mono">{new Date(n.at).toLocaleTimeString()}</span>
          </div>
        ))}
      </div>
      <div className="notes__composer">
        <textarea
          className="notes__input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={channelOpen ? 'Write a note to send…' : 'Waiting for connection…'}
          disabled={!channelOpen}
          rows={2}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
          }}
        />
        <button className="btn btn-primary" onClick={submit} disabled={!channelOpen || !text.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
