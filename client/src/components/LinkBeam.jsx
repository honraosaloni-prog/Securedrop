import './LinkBeam.css';

/**
 * The signature element: two device glyphs joined by a beam.
 *   - idle: beam dim, dashed
 *   - pairing: beam pulses (teal), dot travels across
 *   - connected: beam solid, small lock glyph fades in at center
 */
export function LinkBeam({ state = 'idle', leftLabel = 'This device', rightLabel = 'Peer' }) {
  return (
    <div className={`linkbeam linkbeam--${state}`}>
      <div className="linkbeam__node">
        <DeviceGlyph />
        <span className="linkbeam__label mono">{leftLabel}</span>
      </div>

      <div className="linkbeam__track">
        <div className="linkbeam__line" />
        {state === 'pairing' && <div className="linkbeam__pulse" />}
        {state === 'connected' && (
          <div className="linkbeam__lock" aria-hidden="true">
            <LockGlyph />
          </div>
        )}
      </div>

      <div className="linkbeam__node">
        <DeviceGlyph muted={state === 'idle'} />
        <span className="linkbeam__label mono">{rightLabel}</span>
      </div>
    </div>
  );
}

function DeviceGlyph({ muted }) {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden="true">
      <rect x="4" y="2" width="26" height="30" rx="4" stroke={muted ? '#5b6579' : '#4fd1c5'} strokeWidth="2" />
      <line x1="4" y1="25" x2="30" y2="25" stroke={muted ? '#5b6579' : '#4fd1c5'} strokeWidth="2" />
      <circle cx="17" cy="28.5" r="1.4" fill={muted ? '#5b6579' : '#4fd1c5'} />
    </svg>
  );
}

function LockGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="7" width="10" height="7" rx="1.5" fill="#06201d" stroke="#4fd1c5" strokeWidth="1.4" />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="#4fd1c5" strokeWidth="1.4" />
    </svg>
  );
}
