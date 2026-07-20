export function DeviceList({ devices, myDeviceId, isHost, onRemove }) {
  return (
    <div className="card device-list">
      <div className="device-list__header">
        <span className="label">Connected devices</span>
      </div>
      <ul className="device-list__items">
        {devices.map((d) => {
          const isMe = d.id === myDeviceId;
          const canRemove = isMe || isHost;
          return (
            <li key={d.id} className="device-list__item">
              <span className={`device-list__dot device-list__dot--${d.status}`} />
              <div className="device-list__info">
                <span className="device-list__name">
                  {d.device_name} {isMe && <span className="device-list__you">(you)</span>}
                </span>
                <span className="device-list__meta mono">
                  {d.is_host ? 'host' : 'guest'} · {d.device_type}
                </span>
              </div>
              {canRemove && d.status === 'connected' && (
                <button
                  className="btn btn-ghost device-list__remove"
                  onClick={() => onRemove(d.id)}
                  title={isMe ? 'Leave session' : 'Remove device'}
                >
                  {isMe ? 'Leave' : 'Remove'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
