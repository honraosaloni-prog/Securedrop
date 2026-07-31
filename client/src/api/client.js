const API_URL = import.meta.env.VITE_API_URL || '';

let authToken = null;
export function setAuthToken(token) {
  authToken = token;
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && authToken) headers.Authorization = `Bearer ${authToken}`;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }

  if (!res.ok) {
    const err = new Error(data?.error || `request_failed_${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  createSession: (body) => request('/api/sessions', { method: 'POST', body, auth: false }),
  endSession: () => request('/api/sessions/end', { method: 'POST' }),
  me: () => request('/api/sessions/me'),
  joinSession: (body) => request('/api/devices/join', { method: 'POST', body, auth: false }),
  listDevices: () => request('/api/devices'),
  removeDevice: (deviceId) => request(`/api/devices/${deviceId}/remove`, { method: 'POST' }),
  heartbeat: () => request('/api/devices/heartbeat', { method: 'POST' }),
  createTransfer: (body) => request('/api/transfers', { method: 'POST', body }),
  updateTransfer: (id, body) => request(`/api/transfers/${id}`, { method: 'PATCH', body }),
  listTransfers: () => request('/api/transfers'),
  listActivity: () => request('/api/activity'),
};

export const API_BASE = API_URL;
