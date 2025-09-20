export const api = {
  token() { return localStorage.getItem('token') || null; },
  setToken(t) { localStorage.setItem('token', t); },
  clear() { localStorage.removeItem('token'); },
  async request(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    const t = api.token();
    if (t) headers['Authorization'] = 'Bearer ' + t;
    const res = await fetch(path, { ...opts, headers });
    let payload = null;
    try {
      payload = await res.json();
    } catch (err) {
      payload = null;
    }
    if (!res.ok) {
      const msg = payload?.error || 'Request failed';
      const error = new Error(msg);
      error.status = res.status;
      if (payload) error.data = payload;
      throw error;
    }
    return payload;
  },
  auth: {
    register: (u,p) => api.request('https://gachasimtest.onrender.com/api/auth/register', { method: 'POST', body: JSON.stringify({ username:u, password:p }) }),
    login: (u,p) => api.request('https://gachasimtest.onrender.com/api/auth/login', { method: 'POST', body: JSON.stringify({ username:u, password:p }) }),
    me: () => api.request('https://gachasimtest.onrender.com/api/me')
  },
  banners: () => api.request('https://gachasimtest.onrender.com/api/banners'),
  roll: (bannerId, times) => api.request('https://gachasimtest.onrender.com/api/roll', { method: 'POST', body: JSON.stringify({bannerId, times }) }),
  inventory: () => api.request('https://gachasimtest.onrender.com/api/inventory'),
  claimDaily: () => api.request('https://gachasimtest.onrender.com/api/claim/daily', { method: 'POST' }),
  adventure: {
    history: () => api.request('https://gachasimtest.onrender.com/api/adventure/history'),
    play: party => api.request('https://gachasimtest.onrender.com/api/adventure', {
      method: 'POST',
      body: JSON.stringify({ party })
    })
  }
};
