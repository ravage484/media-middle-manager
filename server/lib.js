import crypto from 'node:crypto';
import { getServices, saveServices, getHistory, addHistory, replaceHistory } from './db.js';
import { keepForExport, keepFromImport } from './keep.js';
import { testTdarr } from './tdarr.js';

export { getServices, saveServices, getHistory };
export const resetLibraryCache = () => { cache.at = 0; }; // after services change underneath us (e.g. a restore)

/* ---------- export / import of settings ---------- */
const SERVICE_TYPES = ['radarr', 'sonarr', 'overseerr', 'prowlarr', 'qbittorrent', 'tautulli', 'plex', 'tdarr'];
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const normUrl = (u) => u.trim().replace(/\/+$/, '').toLowerCase();

export function exportData({ secrets = false, history = true } = {}) {
  const services = getServices().map((s) => ({
    id: s.id, type: s.type, name: s.name, url: s.url, username: s.username || '',
    apiKey: secrets ? s.apiKey || '' : '', password: secrets ? s.password || '' : '',
  }));
  return {
    app: 'media-middle-manager', version: 1, exportedAt: new Date().toISOString(), includesSecrets: !!secrets,
    services, ...(history ? { history: getHistory() } : {}), keep: keepForExport(),
  };
}

// Validates one service from any untrusted source (the settings form, an import file). Only plain http(s) URLs are
// accepted: nothing here should ever be turned into a file:, data: or other-scheme request.
export function cleanService(s, i = 0) {
  const name = str(s?.name, 100).trim();
  const url = str(s?.url, 300).trim();
  if (!SERVICE_TYPES.includes(s?.type)) throw new Error(`Service #${i + 1}: unknown type "${String(s?.type).slice(0, 30)}"`);
  if (!name) throw new Error(`Service #${i + 1}: missing name`);
  let u;
  try { u = new URL(url); } catch { /* handled below */ }
  if (!u || !['http:', 'https:'].includes(u.protocol) || !u.hostname) throw new Error(`Service "${name}": URL must start with http:// or https://`);
  if (u.username || u.password) throw new Error(`Service "${name}": do not put a username or password in the URL`);
  const id = str(s.id, 64);
  if (id && !/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error(`Service "${name}": invalid id`);
  return { id, type: s.type, name, url, apiKey: str(s.apiKey, 200), username: str(s.username, 100), password: str(s.password, 200) };
}

const cleanHistory = (h) => ({
  ...h, steps: Array.isArray(h.steps) ? h.steps : [], removedFiles: Array.isArray(h.removedFiles) ? h.removedFiles : [],
  freedBytes: Number(h.freedBytes) || 0, ok: !!h.ok,
});

// mode "merge": match services by type + URL, update them, add the rest, keep everything else.
// mode "replace": the file becomes the full service list. Blank secrets in the file never erase stored ones.
export function importData(data, { mode = 'merge', history = true } = {}) {
  if (data?.app !== 'media-middle-manager' || !Array.isArray(data.services)) throw new Error('Not a Media Middle Manager export file');
  if (data.version !== 1) throw new Error(`Unsupported export version: ${data.version}`);
  if (data.services.length > 100) throw new Error('Too many services in file');
  if (!['merge', 'replace'].includes(mode)) throw new Error('Invalid import mode');

  const incoming = data.services.map(cleanService);
  const current = getServices();
  const result = mode === 'replace' ? [] : [...current];
  const stats = { mode, added: 0, updated: 0, removed: mode === 'replace' ? current.length : 0, historyAdded: 0, keepAdded: 0 };

  for (const s of incoming) {
    const old = current.find((x) => x.type === s.type && normUrl(x.url) === normUrl(s.url));
    const keep = { apiKey: s.apiKey || old?.apiKey || '', password: s.password || old?.password || '' };
    if (mode === 'merge' && old) {
      result[result.findIndex((x) => x.id === old.id)] = { ...old, name: s.name, url: s.url, username: s.username || old.username || '', ...keep };
      stats.updated++;
    } else {
      const id = s.id && !result.some((x) => x.id === s.id) ? s.id : crypto.randomUUID();
      result.push({ ...s, id, ...keep });
      old ? stats.updated++ : stats.added++;
      if (old && mode === 'replace') stats.removed--;
    }
  }
  saveServices(result);

  if (history && Array.isArray(data.history)) {
    const base = mode === 'replace' ? [] : getHistory();
    const seen = new Set(base.map((h) => h.id));
    const extra = data.history
      .filter((h) => h && typeof h.id === 'string' && typeof h.at === 'string' && typeof h.title === 'string' && !seen.has(h.id))
      .map(cleanHistory);
    stats.historyAdded = extra.length;
    replaceHistory([...base, ...extra].sort((a, b) => b.at.localeCompare(a.at)));
  }
  stats.keepAdded = keepFromImport(data.keep, mode); // the Keep list is small and is yours, so it always comes along
  cache.at = 0; // library depends on the services
  return stats;
}

/* ---------- HTTP clients ---------- */
const base = (s) => s.url.replace(/\/+$/, '');

// fetch() only strips the Authorization header when a redirect crosses to another origin, so our X-Api-Key,
// X-Plex-Token and Cookie headers would be forwarded to whatever host a service (or something on the path) redirects to.
// Same-origin redirects are followed (a few hops); anything else is refused.
async function safeFetch(url, init = {}, hops = 0) {
  const res = await fetch(url, { ...init, redirect: 'manual', signal: init.signal ?? AbortSignal.timeout(30000) });
  if (res.status >= 300 && res.status < 400 && res.headers.has('location')) {
    if (hops >= 3) throw new Error('Too many redirects');
    const next = new URL(res.headers.get('location'), url);
    if (next.origin !== new URL(url).origin) {
      throw new Error(`Refused a redirect to ${next.origin}: following it would send your API key there. If that is the right address, enter it in Settings instead.`);
    }
    await res.arrayBuffer().catch(() => {});
    const keep = res.status === 307 || res.status === 308; // these must repeat the method and body; the others become a GET
    return safeFetch(next.href, keep ? init : { ...init, method: 'GET', body: undefined }, hops + 1);
  }
  return res;
}

async function request(url, init) {
  const res = await safeFetch(url, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${new URL(url).pathname} -> ${res.status} ${text.slice(0, 200)}`);
  try { return text ? JSON.parse(text) : null; } catch { return text; }
}

// Radarr / Sonarr / Prowlarr / Overseerr (X-Api-Key), Plex (X-Plex-Token) and Tdarr (x-api-key, optional on its side)
export function api(svc, p, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' };
  if (svc.type !== 'tdarr' || svc.apiKey) headers[svc.type === 'plex' ? 'X-Plex-Token' : 'X-Api-Key'] = svc.apiKey;
  if (body) headers['Content-Type'] = 'application/json';
  return request(base(svc) + p, { method, headers, body: body && JSON.stringify(body) });
}

// qBittorrent (cookie session)
const cookies = new Map();
async function qbLogin(svc) {
  const r = await safeFetch(base(svc) + '/api/v2/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: base(svc) },
    body: new URLSearchParams({ username: svc.username || '', password: svc.password || '' }),
  });
  const cookie = r.headers.get('set-cookie')?.split(';')[0];
  if ((await r.text()).trim() !== 'Ok.' || !cookie) throw new Error('qBittorrent login failed');
  cookies.set(svc.id, cookie);
  return cookie;
}
export async function qb(svc, p, { method = 'GET', form } = {}, retry = true) {
  const cookie = cookies.get(svc.id) ?? (await qbLogin(svc));
  const headers = { Cookie: cookie, Referer: base(svc) };
  if (form) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  const res = await safeFetch(base(svc) + p, { method, headers, body: form && new URLSearchParams(form) });
  if (res.status === 403 && retry) { cookies.delete(svc.id); return qb(svc, p, { method, form }, false); }
  const text = await res.text();
  if (!res.ok) throw new Error(`qBittorrent ${p} -> ${res.status} ${text.slice(0, 200)}`);
  try { return JSON.parse(text); } catch { return text; }
}

export async function testService(svc) {
  switch (svc.type) {
    case 'radarr':
    case 'sonarr': { const s = await api(svc, '/api/v3/system/status'); return `${s.appName || svc.type} ${s.version}`; }
    case 'prowlarr': {
      const s = await api(svc, '/api/v1/system/status');
      const idx = await api(svc, '/api/v1/indexer').catch(() => []);
      return `Prowlarr ${s.version}, ${idx.length} indexers`;
    }
    case 'overseerr': {
      const [me, s] = await Promise.all([api(svc, '/api/v1/auth/me'), api(svc, '/api/v1/status')]);
      return `Overseerr ${s.version} as ${me.displayName || me.email}`;
    }
    case 'qbittorrent': return 'qBittorrent ' + (await qb(svc, '/api/v2/app/version'));
    case 'tautulli': { const l = await tautulli(svc, 'get_libraries'); return `Tautulli, ${l.length} libraries`; }
    case 'tdarr': return testTdarr(svc);
    case 'plex': { const d = await api(svc, '/library/sections'); return `${d.MediaContainer.Directory?.length ?? 0} libraries`; }
    default: throw new Error('Unknown service type');
  }
}

/* ---------- library (aggregated from every Radarr + Sonarr) ---------- */
let cache = { at: 0, items: [], errors: [] };

// One number to sort the library by, 0 to 10, from what Radarr/Sonarr already list. For a movie it is IMDb's or TMDB's score,
// whichever has more votes; for a show, Sonarr's score; with neither, Rotten Tomatoes or Metacritic scaled down. Scores are weighted
// by their vote count (as IMDb's own top lists are): a thousand votes barely moves a score, while a perfect 10 from a single vote is
// pulled toward the average, so it does not top the list. Anything that is not a sensible number is ignored.
const PRIOR = 6.5, PRIOR_VOTES = 25;
const valid = (v, scale = 1) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 10 * scale;
const round1 = (v) => Math.round(v * 10) / 10;
const weighted = (value, votes) => (valid(value) ? round1(((Number.isInteger(votes) && votes > 0 ? votes : 0) * value + PRIOR_VOTES * PRIOR) / ((Number.isInteger(votes) && votes > 0 ? votes : 0) + PRIOR_VOTES)) : null);
function ratingOf(m, movie) {
  const r = m.ratings;
  if (!r || typeof r !== 'object') return null;
  if (!movie) return valid(r.value) ? (Number.isInteger(r.votes) ? weighted(r.value, r.votes) : round1(r.value)) : null; // Sonarr does not always say how many votes
  const best = [r.imdb, r.tmdb].filter((x) => valid(x?.value)).sort((a, b) => (b.votes || 0) - (a.votes || 0))[0];
  if (best) return weighted(best.value, best.votes);
  return valid(r.rottenTomatoes?.value, 10) ? round1(r.rottenTomatoes.value / 10) : valid(r.metacritic?.value, 10) ? round1(r.metacritic.value / 10) : null;
}

export async function getLibrary(force = false) {
  if (!force && Date.now() - cache.at < 60000) return cache;
  const svcs = getServices().filter((s) => s.type === 'radarr' || s.type === 'sonarr');
  const map = new Map();
  const errors = [];
  await Promise.all(svcs.map(async (s) => {
    try {
      const movie = s.type === 'radarr';
      const [list, tagList] = await Promise.all([
        api(s, movie ? '/api/v3/movie' : '/api/v3/series'),
        api(s, '/api/v3/tag').catch(() => []), // tags are optional; don't fail the library over them
      ]);
      const tagName = new Map(tagList.map((x) => [x.id, x.label]));
      for (const m of list) {
        const tags = (m.tags || []).map((id) => tagName.get(id)).filter(Boolean);
        const type = movie ? 'movie' : 'show';
        const key = `${type}:${movie ? m.tmdbId : m.tvdbId || m.tmdbId || m.id + '@' + s.id}`;
        const size = movie ? m.sizeOnDisk || 0 : m.statistics?.sizeOnDisk || 0;
        const hasFile = movie ? !!m.hasFile : (m.statistics?.episodeFileCount || 0) > 0;
        const img = m.images?.find((i) => i.coverType === 'poster');
        const it = map.get(key) || {
          key, type, title: m.title, year: m.year, tmdbId: m.tmdbId, tvdbId: m.tvdbId,
          poster: img?.remoteUrl || null, overview: m.overview, added: m.added,
          size: 0, hasFile: false, monitored: false, instances: [], genres: m.genres || [], episodes: 0, tags: [], rating: null,
        };
        it.tags = [...new Set([...it.tags, ...tags])].sort();
        it.size += size;
        it.episodes += m.statistics?.episodeFileCount || 0;
        it.hasFile ||= hasFile;
        it.monitored ||= !!m.monitored;
        it.poster ||= img?.remoteUrl || null;
        it.rating ??= ratingOf(m, movie);
        it.instances.push({ serviceId: s.id, serviceName: s.name, arrId: m.id, monitored: !!m.monitored, size, hasFile, path: m.path,
          root: (m.rootFolderPath || (m.path || '').replace(/[\\/][^\\/]*$/, '')).replace(/[\\/]+$/, '') || '(unknown)' });
        map.set(key, it);
      }
    } catch (e) { errors.push(`${s.name}: ${e.message}`); }
  }));
  const items = [...map.values()];
  await addWatch(items, errors);
  cache = { at: Date.now(), items, errors };
  return cache;
}

/* ---------- watch history (Tautulli preferred, Plex as fallback) ---------- */
const norm = (t) => (t || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');

export async function tautulli(svc, cmd, params = {}) {
  const r = await request(`${base(svc)}/api/v2?${new URLSearchParams({ apikey: svc.apiKey, cmd, ...params })}`, {});
  if (r.response?.result !== 'success') throw new Error(r.response?.message || 'Tautulli error');
  return r.response.data;
}

async function tautulliRows(svc) {
  const rows = [];
  const libs = await tautulli(svc, 'get_libraries');
  for (const l of libs.filter((x) => x.section_type === 'movie' || x.section_type === 'show')) {
    const d = await tautulli(svc, 'get_library_media_info', { section_id: l.section_id, length: 100000 });
    for (const m of d.data || []) rows.push({ type: l.section_type, title: m.title, year: Number(m.year) || 0, plays: Number(m.play_count) || 0, last: Number(m.last_played) || 0, guids: [] });
  }
  return rows;
}

async function plexRows(svc) {
  const rows = [];
  const d = await api(svc, '/library/sections');
  for (const sec of (d.MediaContainer.Directory || []).filter((x) => x.type === 'movie' || x.type === 'show')) {
    const movie = sec.type === 'movie';
    for (let start = 0; ;) {
      const r = await api(svc, `/library/sections/${sec.key}/all?type=${movie ? 1 : 2}&includeGuids=1&X-Plex-Container-Start=${start}&X-Plex-Container-Size=500`);
      const md = r.MediaContainer.Metadata || [];
      for (const m of md) {
        rows.push({
          type: sec.type, title: m.title, year: m.year || 0,
          plays: movie ? m.viewCount || 0 : m.viewedLeafCount || 0, // Plex tracks only the token owner's plays
          last: m.lastViewedAt || 0, guids: (m.Guid || []).map((g) => g.id),
        });
      }
      start += md.length;
      if (!md.length || start >= (r.MediaContainer.totalSize ?? r.MediaContainer.size)) break;
    }
  }
  return rows;
}

// Index rows by external id and by title+year; rows for the same title (e.g. HD + 4K libraries) are merged.
function indexRows(rows, source) {
  const byGuid = new Map(), byTY = new Map(), byT = new Map();
  const put = (m, k, r) => {
    const cur = m.get(k);
    if (cur) { cur.plays += r.plays; cur.last = Math.max(cur.last, r.last); cur.n++; }
    else m.set(k, { plays: r.plays, last: r.last, source, n: 1 });
  };
  for (const r of rows) {
    r.guids.forEach((g) => put(byGuid, `${r.type}:${g}`, r));
    put(byTY, `${r.type}:${norm(r.title)}:${r.year}`, r);
    put(byT, `${r.type}:${norm(r.title)}`, r);
  }
  return (item) => {
    const hit = byGuid.get(`${item.type}:tmdb://${item.tmdbId}`) || byGuid.get(`${item.type}:tvdb://${item.tvdbId}`)
      || byTY.get(`${item.type}:${norm(item.title)}:${item.year}`)
      || [byT.get(`${item.type}:${norm(item.title)}`)].find((x) => x && x.n === 1);
    return hit && { plays: hit.plays, last: hit.last, source };
  };
}

async function addWatch(items, errors) {
  const svcs = getServices();
  const matchers = [];
  for (const [type, fetchRows] of [['tautulli', tautulliRows], ['plex', plexRows]]) {
    for (const s of svcs.filter((x) => x.type === type)) {
      try { matchers.push(indexRows(await fetchRows(s), type)); } catch (e) { errors.push(`${s.name}: ${e.message}`); }
    }
  }
  for (const it of items) it.watch = matchers.length ? matchers.reduce((hit, m) => hit || m(it), null) || null : null;
}

/* ---------- plan: what would be touched for an item ---------- */
async function planItem(item) {
  const svcs = getServices();
  const byId = Object.fromEntries(svcs.map((s) => [s.id, s]));
  const p = { key: item.key, title: item.title, year: item.year, type: item.type, poster: item.poster, overseerr: [], arrs: [], torrents: [], warnings: [] };

  for (const o of svcs.filter((s) => s.type === 'overseerr')) {
    if (!item.tmdbId) { p.warnings.push('No TMDB id; cannot look up Overseerr'); break; }
    try {
      const d = await api(o, `/api/v1/${item.type === 'movie' ? 'movie' : 'tv'}/${item.tmdbId}`);
      if (d.mediaInfo) {
        p.overseerr.push({
          serviceId: o.id, serviceName: o.name, mediaId: d.mediaInfo.id,
          requests: (d.mediaInfo.requests || []).map((r) => ({ id: r.id, by: r.requestedBy?.displayName || r.requestedBy?.email })),
        });
      }
    } catch (e) { if (!/ 404 /.test(e.message)) p.warnings.push(`${o.name}: ${e.message}`); }
  }

  const hashes = new Set();
  for (const inst of item.instances) {
    const svc = byId[inst.serviceId];
    if (!svc) continue;
    const movie = item.type === 'movie';
    try {
      const [files, hist] = await Promise.all([
        api(svc, movie ? `/api/v3/moviefile?movieId=${inst.arrId}` : `/api/v3/episodefile?seriesId=${inst.arrId}`),
        api(svc, movie ? `/api/v3/history/movie?movieId=${inst.arrId}` : `/api/v3/history/series?seriesId=${inst.arrId}`).catch(() => []),
      ]);
      p.arrs.push({
        serviceId: svc.id, serviceName: svc.name, arrId: inst.arrId, monitored: inst.monitored,
        files: files.map((f) => ({ id: f.id, path: f.path, size: f.size })),
      });
      for (const h of hist) if (h.downloadId) hashes.add(h.downloadId.toLowerCase());
    } catch (e) { p.warnings.push(`${svc.name}: ${e.message}`); }
  }

  if (hashes.size) {
    for (const q of svcs.filter((s) => s.type === 'qbittorrent')) {
      try {
        const list = await qb(q, `/api/v2/torrents/info?hashes=${[...hashes].join('|')}`);
        for (const t of list) p.torrents.push({ serviceId: q.id, serviceName: q.name, hash: t.hash, name: t.name, size: t.size, state: t.state });
      } catch (e) { p.warnings.push(`${q.name}: ${e.message}`); }
    }
  }
  return p;
}

export async function plan(keys) {
  const { items } = await getLibrary(true);
  const out = [];
  for (const key of keys) {
    const item = items.find((i) => i.key === key);
    out.push(item ? await planItem(item) : { key, title: key, overseerr: [], arrs: [], torrents: [], warnings: ['Not found in library'] });
  }
  return out;
}

/* ---------- execute ---------- */
async function unmonitor(svc, type, id) {
  if (type === 'movie') {
    const m = await api(svc, `/api/v3/movie/${id}`);
    m.monitored = false;
    return api(svc, `/api/v3/movie/${id}`, { method: 'PUT', body: m });
  }
  const s = await api(svc, `/api/v3/series/${id}`);
  s.monitored = false;
  s.seasons?.forEach((x) => (x.monitored = false));
  await api(svc, `/api/v3/series/${id}`, { method: 'PUT', body: s });
  const eps = await api(svc, `/api/v3/episode?seriesId=${id}`);
  if (eps.length) await api(svc, '/api/v3/episode/monitor', { method: 'PUT', body: { episodeIds: eps.map((e) => e.id), monitored: false } });
}

export async function execute(keys, opts) {
  const svcs = getServices();
  const byId = Object.fromEntries(svcs.map((s) => [s.id, s]));
  const plans = await plan(keys);
  const results = [];

  for (const p of plans) {
    const steps = [];
    const run = async (label, fn) => {
      try { steps.push({ label, ok: true, detail: (await fn()) || '' }); return true; }
      catch (e) { steps.push({ label, ok: false, detail: e.message }); return false; }
    };
    const removedFiles = [];

    // 1. Overseerr
    if (opts.overseerr !== 'none') {
      for (const o of p.overseerr) {
        const svc = byId[o.serviceId];
        for (const r of o.requests) {
          if (opts.overseerr === 'decline') await run(`${o.serviceName}: decline request #${r.id}`, () => api(svc, `/api/v1/request/${r.id}/decline`, { method: 'POST' }));
          else await run(`${o.serviceName}: delete request #${r.id}`, () => api(svc, `/api/v1/request/${r.id}`, { method: 'DELETE' }));
        }
        // Clearing the media record lets Overseerr stop showing it as available/processing.
        if (opts.overseerr === 'delete') await run(`${o.serviceName}: reset media record #${o.mediaId}`, () => api(svc, `/api/v1/media/${o.mediaId}`, { method: 'DELETE' }));
      }
    }

    // 2 + 3. Unmonitor in each Arr, then delete files only where unmonitoring succeeded
    for (const a of p.arrs) {
      const svc = byId[a.serviceId];
      const ok = await run(`${a.serviceName}: unmonitor`, () => unmonitor(svc, p.type, a.arrId));
      if (!opts.files) continue;
      if (!ok) { steps.push({ label: `${a.serviceName}: delete files`, ok: false, detail: 'Skipped: unmonitor failed, file removal could trigger a re-download' }); continue; }
      for (const f of a.files) {
        const good = await run(`${a.serviceName}: delete file ${f.path.split(/[\\/]/).pop()}`, () =>
          api(svc, p.type === 'movie' ? `/api/v3/moviefile/${f.id}` : `/api/v3/episodefile/${f.id}`, { method: 'DELETE' }));
        if (good) removedFiles.push({ service: a.serviceName, path: f.path, size: f.size });
      }
    }

    // 4. qBittorrent
    if (opts.torrents) {
      const groups = {};
      for (const t of p.torrents) (groups[t.serviceId] ||= []).push(t);
      for (const [sid, ts] of Object.entries(groups)) {
        await run(`${byId[sid].name}: remove ${ts.length} torrent(s) + data`, () =>
          qb(byId[sid], '/api/v2/torrents/delete', { method: 'POST', form: { hashes: ts.map((t) => t.hash).join('|'), deleteFiles: 'true' } }));
      }
    }
    results.push({ plan: p, steps, removedFiles });
  }

  // 5. Plex rescan (once)
  if (opts.plex && results.some((r) => r.removedFiles.length)) {
    const plexSteps = [];
    for (const px of svcs.filter((s) => s.type === 'plex')) {
      try {
        const d = await api(px, '/library/sections');
        const secs = (d.MediaContainer.Directory || []).filter((x) => x.type === 'movie' || x.type === 'show');
        for (const sec of secs) await api(px, `/library/sections/${sec.key}/refresh`);
        plexSteps.push({ label: `${px.name}: scan ${secs.length} libraries`, ok: true, detail: '' });
      } catch (e) { plexSteps.push({ label: `${px.name}: scan`, ok: false, detail: e.message }); }
    }
    results.forEach((r) => r.steps.push(...plexSteps));
  }

  // 6. History
  const at = new Date().toISOString();
  for (const r of results) {
    const { plan: p } = r;
    addHistory({
      id: crypto.randomUUID(), at, key: p.key, title: p.title, year: p.year, type: p.type, options: opts,
      freedBytes: r.removedFiles.reduce((n, f) => n + (f.size || 0), 0),
      removedFiles: r.removedFiles, steps: r.steps, ok: r.steps.every((s) => s.ok),
    });
  }
  cache.at = 0; // force library refresh
  return results.map((r) => ({ key: r.plan.key, title: r.plan.title, steps: r.steps, ok: r.steps.every((s) => s.ok) }));
}
