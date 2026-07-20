import { useState } from 'react';
import { Landing } from './pages/Landing.jsx';
import { Host } from './pages/Host.jsx';
import { Join } from './pages/Join.jsx';

const EXIT_MESSAGES = {
  ended: 'The session has ended. Any temporary data has been cleared.',
  expired: 'The session expired for inactivity or timeout.',
  left: 'You left the session.',
};

export default function App() {
  const [view, setView] = useState('landing');
  const [banner, setBanner] = useState(null);

  function goLanding(reason) {
    if (reason && EXIT_MESSAGES[reason]) setBanner(EXIT_MESSAGES[reason]);
    setView('landing');
  }

  return (
    <>
      {banner && (
        <div className="app-banner">
          <span>{banner}</span>
          <button className="btn btn-ghost" onClick={() => setBanner(null)}>Dismiss</button>
        </div>
      )}
      {view === 'landing' && (
        <Landing onHost={() => { setBanner(null); setView('host'); }} onJoin={() => { setBanner(null); setView('join'); }} />
      )}
      {view === 'host' && <Host onBack={goLanding} />}
      {view === 'join' && <Join onBack={goLanding} />}
    </>
  );
}
