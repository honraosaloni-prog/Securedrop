import { useEffect, useState } from 'react';

/** Draining conic-gradient ring showing time remaining until session expiry. */
export function CountdownRing({ expiresAt, totalMs, size = 64 }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = Math.max(0, expiresAt - now);
  const fraction = totalMs ? Math.min(1, remaining / totalMs) : 0;
  const urgent = remaining < 60_000;
  const color = urgent ? '#f0a868' : '#4fd1c5';
  const deg = fraction * 360;

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);

  return (
    <div
      className="countdown-ring"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: `conic-gradient(${color} ${deg}deg, #1a2333 0deg)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.6s linear',
        flexShrink: 0,
      }}
      role="timer"
      aria-label={`Session expires in ${minutes} minutes ${seconds} seconds`}
      title="Time until this session expires"
    >
      <div
        style={{
          width: size - 10,
          height: size - 10,
          borderRadius: '50%',
          background: 'var(--bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-display)',
          fontSize: size > 56 ? '0.72rem' : '0.6rem',
          color: urgent ? color : 'var(--text-dim)',
        }}
      >
        {minutes}:{String(seconds).padStart(2, '0')}
      </div>
    </div>
  );
}
