import { LinkBeam } from '../components/LinkBeam.jsx';

export function Landing({ onHost, onJoin }) {
  return (
    <div className="page page--center">
      <div className="landing card">
        <span className="eyebrow">SecureDrop</span>
        <h1 className="landing__title">A temporary, encrypted airlock between two browsers.</h1>
        <p className="landing__sub">
          Pair a phone and a computer, move files, photos, notes, and clipboard text directly
          between them, then the link disappears. Nothing is stored on a server.
        </p>

        <LinkBeam state="idle" leftLabel="Your PC" rightLabel="Your phone" />

        <div className="landing__actions">
          <button className="btn btn-primary landing__action" onClick={onHost}>
            Start a session
            <span className="landing__action-sub">Show a code on this device</span>
          </button>
          <button className="btn landing__action" onClick={onJoin}>
            Join a session
            <span className="landing__action-sub">Enter a code from another device</span>
          </button>
        </div>

        <ul className="landing__facts">
          <li>End-to-end encrypted, peer-to-peer — files never touch a server</li>
          <li>Sessions expire automatically and can be ended from either device</li>
          <li>Only one device can pair per session — no surprise guests</li>
        </ul>
      </div>
    </div>
  );
}
