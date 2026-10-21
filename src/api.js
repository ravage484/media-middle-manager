const j = async (r) => {
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && !r.url.includes('/api/auth/')) window.dispatchEvent(new Event('mmm-unauthorized')); // session ended: show the sign-in page
  if (!r.ok) throw new Error(d.error || r.statusText);
  return d;
};
const send = (method, url, body) =>
  fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(j);

export const api = {
  authStatus: () => fetch('/api/auth/status').then(j),
  setup: (username, password) => send('POST', '/api/auth/setup', { username, password }),
  login: (username, password) => send('POST', '/api/auth/login', { username, password }),
  logout: () => send('POST', '/api/auth/logout', {}),
  changePassword: (current, next) => send('POST', '/api/auth/password', { current, next }),
  library: (refresh) => fetch('/api/library' + (refresh ? '?refresh=1' : '')).then(j),
  services: () => fetch('/api/services').then(j),
  saveServices: (s) => send('PUT', '/api/services', s),
  test: (s) => send('POST', '/api/services/test', s),
  plan: (keys) => send('POST', '/api/plan', { keys }),
  remove: (keys, options) => send('POST', '/api/delete', { keys, options }),
  history: () => fetch('/api/history').then(j),
  exportData: (secrets, history) => fetch(`/api/export?secrets=${secrets ? 1 : 0}&history=${history ? 1 : 0}`).then(j),
  importData: (data, options) => send('POST', '/api/import', { data, options }),
  security: () => fetch('/api/security').then(j),
  restoreDb: (file) => fetch('/api/restore', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file }).then(j),
};

export function watchLabel(w) {
  if (!w) return 'Unknown';
  if (!w.plays) return 'Never watched';
  if (!w.last) return `${w.plays} plays`;
  const d = Math.floor((Date.now() / 1000 - w.last) / 86400);
  return d < 1 ? 'Watched today' : d < 60 ? `Watched ${d}d ago` : d < 730 ? `Watched ${Math.round(d / 30)}mo ago` : `Watched ${Math.round(d / 365)}y ago`;
}

export function fmtBytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i > 1 ? 1 : 0)} ${u[i]}`;
}
