const ACTION_LABELS = {
  session_created: 'Session created',
  device_joined: 'Device joined',
  device_removed: 'Device removed',
  transfer_initiated: 'Transfer started',
  transfer_completed: 'Transfer completed',
  transfer_failed: 'Transfer failed',
  transfer_rejected: 'Transfer rejected',
  session_ended: 'Session ended',
};

export function ActivityLog({ items }) {
  return (
    <div className="card activity-log">
      <span className="label">Activity</span>
      <ul className="activity-log__items">
        {items.length === 0 && <li className="activity-log__empty">No activity yet.</li>}
        {items.map((a) => (
          <li key={a.id} className="activity-log__item">
            <span className="activity-log__action">{ACTION_LABELS[a.action] || a.action}</span>
            <span className="activity-log__detail mono">{a.device_name || 'system'}{a.detail ? ` · ${a.detail}` : ''}</span>
            <time className="activity-log__time mono">{new Date(a.created_at).toLocaleTimeString()}</time>
          </li>
        ))}
      </ul>
    </div>
  );
}
