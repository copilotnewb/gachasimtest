export const api = {
  token() { return localStorage.getItem('token') || null; },
  setToken(t) { localStorage.setItem('token', t); },
  clear() { localStorage.removeItem('token'); },
  async request(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    const t = api.token();
    if (t) headers['Authorization'] = 'Bearer ' + t;
    const res = await fetch(path, { ...opts, headers });
    if (!res.ok) {
      let msg = 'Request failed';
      try { const j = await res.json(); msg = j.error || msg; } catch {}
      throw new Error(msg);
    }
    return res.json();
  },
  auth: {
    register: (u,p) => api.request('/api/auth/register', { method: 'POST', body: JSON.stringify({ username:u, password:p }) }),
    login: (u,p) => api.request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username:u, password:p }) }),
    me: () => api.request('/api/me')
  },
  banners: () => api.request('/api/banners'),
  roll: (bannerId, times) => api.request('/api/roll', { method: 'POST', body: JSON.stringify({ bannerId, times }) }),
  inventory: () => api.request('/api/inventory'),
  claimDaily: () => api.request('/api/claim/daily', { method: 'POST' })
}
