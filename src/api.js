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
  about: () => fetch('/api/about').then(j),
  security: () => fetch('/api/security').then(j),
  details: (key) => fetch(`/api/details?key=${encodeURIComponent(key)}`).then(j),
  plexItem: (key) => fetch(`/api/plex/item?key=${encodeURIComponent(key)}`).then(j),
  plexAct: (key, body) => send('POST', '/api/plex/act', { key, ...body }),
  discover: (params) => fetch(`/api/discover?${new URLSearchParams(params)}`).then(j),
  discoverSearch: (q, page) => fetch(`/api/discover/search?${new URLSearchParams({ q, page })}`).then(j),
  discoverGenres: (type) => fetch(`/api/discover/genres?type=${type}`).then(j),
  libraryPerson: (id) => fetch(`/api/library/person?${new URLSearchParams({ id })}`).then(j),
  discoverPerson: (id) => fetch(`/api/discover/person?${new URLSearchParams({ id })}`).then(j),
  discoverTitle: (type, id) => fetch(`/api/discover/title?${new URLSearchParams({ type, id })}`).then(j),
  discoverRequest: (body) => send('POST', '/api/discover/request', body),
  discoverUnrequest: (requestId) => send('POST', '/api/discover/unrequest', { requestId }),
  widgets: () => fetch('/api/widgets').then(j),
  widgetData: (id) => fetch(`/api/widgets/data?id=${encodeURIComponent(id)}`).then(j),
  widgetAction: (id, action, arg) => send('POST', '/api/widgets/action', { id, action, arg }),
  keepList: () => fetch('/api/keep').then(j),
  keepSet: (keys, keep) => send('POST', '/api/keep', { keys, keep }),
  recommendations: (key, kind, page) => fetch(`/api/recommendations?key=${encodeURIComponent(key)}&kind=${kind}&page=${page}`).then(j),
  plexCache: () => fetch('/api/plex/cache').then(j),
  plexSync: () => send('POST', '/api/plex/sync', {}),
  keywords: () => fetch('/api/keywords').then(j),
  keywordSync: (force) => send('POST', '/api/keywords/sync', { force: !!force }),
  keywordAuto: (auto) => send('PUT', '/api/keywords/auto', auto),
  keywordNewToken: () => send('POST', '/api/keywords/webhook/token', {}),
  keywordStop: () => send('POST', '/api/keywords/stop', {}),
  episodes: (key) => fetch(`/api/episodes?key=${encodeURIComponent(key)}`).then(j),
  episodePlan: (key, selection) => send('POST', '/api/episodes/plan', { key, selection }),
  episodeDelete: (key, selection, options) => send('POST', '/api/episodes/delete', { key, selection, options }),
  // sourceKey (optional) travels base64-encoded in a header, never in the URL.
  restoreDb: (file, sourceKey) => {
    const headers = { 'Content-Type': 'application/octet-stream' };
    if (sourceKey) headers['X-Source-Key'] = btoa(unescape(encodeURIComponent(sourceKey)));
    return fetch('/api/restore', { method: 'POST', headers, body: file }).then(j);
  },
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
