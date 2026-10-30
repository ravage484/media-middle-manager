import crypto from 'node:crypto';
import { api, getServices, qb } from '../lib.js';
import { addHistory } from '../db.js';
import { log } from '../log.js';
import { fmtBytes, fmtEta, timeleftSec, str, int, pct, isoDate, httpUrl } from './util.js';
import { titleIndex, titleRef, posterIn } from './titles.js';

/* Radarr and Sonarr: what is downloading, what is coming up, and how full the drives are. */
const of = (type) => getServices().filter((s) => s.type === type);
const arr = () => [...of('radarr'), ...of('sonarr')];
const ymd = (d) => d.toISOString().slice(0, 10);
const label = (state) => ({ importBlocked: 'Import blocked', importPending: 'Waiting to import', importing: 'Importing', downloading: 'Downloading', downloadFailed: 'Download failed' }[state] || str(state, 30) || 'Queued');
const sxe = (s, e) => `S${String(Number.isInteger(s) ? s : 0).padStart(2, '0')}E${String(Number.isInteger(e) ? e : 0).padStart(2, '0')}`;

// Seconds left and last activity (unix seconds) per torrent, by lower-case hash, from every qBittorrent; empty when there is none or
// it cannot be reached.
async function torrentInfo() {
  const map = new Map();
  await Promise.all(getServices().filter((s) => s.type === 'qbittorrent').map(async (s) => {
    try { for (const t of await qb(s, '/api/v2/torrents/info?filter=downloading')) map.set(String(t.hash).toLowerCase(), { eta: t.eta, active: t.last_activity, stalled: t.state === 'stalledDL' }); } catch { /* optional */ }
  }));
  return map;
}

// Fallback for downloads qBittorrent does not report: when each queue item last moved (id -> { left, since }); one whose bytes left
// have not changed for a day is stalled. Lives in memory, so a restart starts the clock again.
const STALLED_MS = 24 * 3600000;
const moved = new Map();
const stalledFor = (id, left, now = Date.now()) => {
  const m = moved.get(id);
  if (!m || m.left !== left) { moved.set(id, { left, since: now }); return false; }
  return left > 0 && now - m.since >= STALLED_MS;
};

// The download queue of every Radarr and Sonarr, one row per item. `attention` counts the rows that need a person: stalled, failed or
// warned about. Shared by the queue list and the Needs attention tile, and kept for a few seconds so the two do not ask twice.
let queueCache = { at: 0, promise: null };
const queueData = () => {
  if (queueCache.promise && Date.now() - queueCache.at < 5000) return queueCache.promise;
  queueCache = { at: Date.now(), promise: buildQueue().catch((e) => { queueCache = { at: 0, promise: null }; throw e; }) };
  return queueCache.promise;
};

// Takes an item out of its Radarr or Sonarr queue (and out of the download client). With blocklist the release is never picked again, so
// the *arr looks for another one; without it the title is simply no longer waiting on this download.
const dropFromQueue = ({ blocklist }) => async (arg) => {
  const m = /^(.+):(\d{1,9}(?:,\d{1,9}){0,99})$/.exec(String(arg)); // a download is one or more queue records (a season pack has one per episode)
  const svc = m && arr().find((x) => x.id === m[1]);
  if (!svc) throw Object.assign(new Error('Unknown download'), { userError: true });
  const ids = m[2].split(',').map(Number);
  const row = (await queueData().catch(() => ({ rows: [] }))).rows.find((r) => r.id === String(arg)); // what it is, for the record
  const flags = `removeFromClient=true&blocklist=${blocklist}&skipRedownload=${!blocklist}`;
  if (ids.length === 1) await api(svc, `/api/v3/queue/${ids[0]}?${flags}`, { method: 'DELETE' });
  else await api(svc, `/api/v3/queue/bulk?${flags}`, { method: 'DELETE', body: { ids } });
  queueCache = { at: 0, promise: null }; // the list just changed
  // Recorded in the History tab with the deletions: this too throws something away, and says why you might want to know later.
  const did = blocklist ? 'Removed from the download queue and blocklisted, so another release is searched for' : 'Removed from the download queue and the download client';
  addHistory({
    id: crypto.randomUUID(), at: new Date().toISOString(), key: row?.open?.inLibrary ?? null, title: row?.title || 'Unknown download', year: null, type: 'download',
    options: { blocklist }, freedBytes: 0, removedFiles: [], steps: [{ label: `${did}${row?.subtitle ? ` (it was: ${row.subtitle})` : ''}`, ok: true, detail: '' }], ok: true,
  });
  log.info('queue', blocklist ? 'blocklisted and removed a download' : 'removed a download', { service: svc.name, title: row?.title, records: ids.length });
};

async function buildQueue() {
  const rows = [];
  const seen = new Set();
  const idx = await titleIndex();
  const torrents = await torrentInfo(); // qBittorrent knows the time left, and when it last moved, when the *arr does not
  await Promise.all(arr().map(async (svc) => {
    const movie = svc.type === 'radarr';
    const q = await api(svc, `/api/v3/queue?page=1&pageSize=100&${movie ? 'includeMovie=true' : 'includeSeries=true&includeEpisode=true'}`);
    // The *arr lists one record per episode, but a season pack is one download: every episode of it shares the download's id.
    const downloads = new Map();
    for (const r of Array.isArray(q?.records) ? q.records : []) {
      if (!r || typeof r !== 'object' || !int(r.id)) continue;
      const k = str(r.downloadId, 100) || `record:${r.id}`;
      if (!downloads.has(k)) downloads.set(k, []);
      downloads.get(k).push(r);
    }
    for (const recs of downloads.values()) {
      recs.sort((x, y) => (x.episode?.seasonNumber ?? 0) - (y.episode?.seasonNumber ?? 0) || (x.episode?.episodeNumber ?? 0) - (y.episode?.episodeNumber ?? 0));
      const r = recs[0]; // a pack's records all describe the whole download, so the first stands for it
      const ids = recs.map((x) => int(x.id));
      const rid = `${svc.id}:${ids.join(',')}`;
      seen.add(rid);
      const left = typeof r.sizeleft === 'number' ? r.sizeleft : 0;
      const size = typeof r.size === 'number' ? r.size : 0;
      const tor = torrents.get(String(r.downloadId || '').toLowerCase());
      const stalled = Number.isInteger(tor?.active) && tor.active > 0 ? left > 0 && Date.now() - tor.active * 1000 >= STALLED_MS : stalledFor(rid, left);
      const bad = stalled || recs.some((x) => x.trackedDownloadStatus === 'warning' || x.trackedDownloadStatus === 'error');
      const eta = fmtEta(timeleftSec(r.timeleft)) || fmtEta(tor?.eta);
      const t = movie ? r.movie : r.series;
      const why = recs.flatMap((x) => (Array.isArray(x.statusMessages) ? x.statusMessages : [])).flatMap((m) => (Array.isArray(m?.messages) ? m.messages : [])).map((m) => str(m, 160)).filter(Boolean)[0] || str(r.errorMessage, 160);
      const seasons = [...new Set(recs.map((x) => x.episode?.seasonNumber).filter(Number.isInteger))];
      // one episode: "Show S02E03"; several: "Show S02" (or "S01, S02"), with the episodes listed under it
      const what = movie ? '' : recs.length > 1
        ? ` ${seasons.map((n) => `S${String(n).padStart(2, '0')}`).join(', ')}`
        : r.episode && Number.isInteger(r.episode.seasonNumber) ? ` ${sxe(r.episode.seasonNumber, r.episode.episodeNumber)}` : '';
      rows.push({
        id: rid, state: stalled || tor?.stalled ? 'stalled' : bad ? 'attention' : 'downloading', title: str(movie ? r.movie?.title : `${r.series?.title || ''}${what}`, 120) || str(r.title, 120),
        subtitle: label(r.trackedDownloadState) + (recs.length > 1 ? `, ${recs.length} episodes` : '') + (bad && why ? `: ${why}` : ''),
        progress: size > 0 ? pct(1 - left / size) : 0, right: [left > 0 ? `${fmtBytes(left)} left` : fmtBytes(size), eta && left > 0 ? `~${eta}` : ''].filter(Boolean).join(' · '),
        ...(recs.length > 1 ? { children: recs.slice(0, 100).map((x) => ({ id: `${svc.id}:${x.id}`, title: sxe(x.episode?.seasonNumber, x.episode?.episodeNumber), subtitle: str(x.episode?.title, 100) || label(x.trackedDownloadState) })) } : {}),
        ...titleRef(idx, { type: movie ? 'movie' : 'show', tmdbId: int(t?.tmdbId), tvdbId: int(t?.tvdbId), title: t?.title, year: int(t?.year), poster: posterIn(t?.images) }),
        ...(tor?.stalled ? { chip: { text: 'Stalled', tone: 'bad', hint: 'qBittorrent reports no data moving' } } : {}),
        ...(bad ? {
          badge: { text: 'Needs attention', tone: 'warn', hint: why || (stalled ? 'No progress for over 24 hours' : 'Click for options') },
          // what the chip or badge opens: what is wrong, the choices, and where the service shows it
          manage: { why: why || (stalled ? 'No progress for over 24 hours.' : ''), service: svc.name, href: httpUrl(`${svc.url.replace(/\/+$/, '')}/activity/queue`), actions: [{ id: 'retry', label: 'Blocklist & retry', hint: 'Remove it and never pick this release again, so another one is searched for' }, { id: 'remove', label: 'Remove', hint: 'Take it out of the queue and the download client' }] },
        } : {}),
      });
    }
  }));
  for (const k of moved.keys()) if (!seen.has(k)) moved.delete(k); // finished or removed
  rows.sort((a, b) => !!b.badge - !!a.badge); // what needs a person first, so it is never cut off the end of the list
  // library key -> how its download stands, the worst of its items (a show can have several): for the rest of the app to show
  const rank = { downloading: 1, attention: 2, stalled: 3 };
  const states = {};
  for (const r of rows) { const k = r.open?.inLibrary; if (k && (rank[r.state] || 0) > (rank[states[k]] || 0)) states[k] = r.state; }
  return { rows, states, attention: rows.filter((r) => r.badge).length };
}

// Where each title's download stands, by library key. Empty when nothing is downloading or the services cannot be reached.
export const downloadStates = () => (arr().length ? queueData().then((d) => d.states).catch(() => ({})) : Promise.resolve({}));

export default {
  type: 'arr', name: 'Radarr and Sonarr',
  widgets: [
    {
      id: 'queue', title: 'Download queue', kind: 'list', requires: ['radarr', 'sonarr'], refresh: 10, order: 21, control: { span: 2 }, media: 'chip',
      actions: { retry: dropFromQueue({ blocklist: true }), remove: dropFromQueue({ blocklist: false }) },
      fetch: async () => {
        const { rows, attention } = await queueData();
        const chip = [rows.length ? `${rows.length} downloading` : '', attention ? `${attention} need${attention === 1 ? 's' : ''} attention` : ''].filter(Boolean).join(' · ');
        return { rows: rows.slice(0, 50), fold: 4, empty: 'Nothing is downloading.', chip };
      },
    },
    {
      id: 'attention', title: 'Needs attention', kind: 'stat', requires: ['radarr', 'sonarr'], refresh: 30, order: 14, control: { span: 1 }, media: 'hidden',
      fetch: async () => {
        const { attention } = await queueData();
        return { value: String(attention), sub: attention ? 'in the download queue' : 'all clear', tone: attention ? 'warn' : '' };
      },
    },
    {
      id: 'upcoming', title: 'Coming up', kind: 'list', requires: ['radarr', 'sonarr'], refresh: 600, order: 23, control: { span: 2 }, media: 'hidden',
      fetch: async () => {
        const start = new Date();
        const end = new Date(Date.now() + 14 * 86400000);
        const win = (iso) => { const t = Date.parse(iso); return !Number.isNaN(t) && t >= start.getTime() - 86400000 && t <= end.getTime(); };
        const rows = [];
        const idx = await titleIndex();
        await Promise.all(arr().map(async (svc) => {
          const movie = svc.type === 'radarr';
          const list = await api(svc, `/api/v3/calendar?start=${ymd(start)}&end=${ymd(end)}${movie ? '' : '&includeSeries=true'}`);
          for (const e of Array.isArray(list) ? list : []) {
            if (!e || typeof e !== 'object') continue;
            if (movie) {
              const kinds = [['digitalRelease', 'Digital release'], ['physicalRelease', 'Physical release'], ['inCinemas', 'In cinemas']];
              const hit = kinds.find(([k]) => win(e[k]));
              if (hit) rows.push({ id: `m${int(e.id)}`, title: str(e.title, 120), subtitle: hit[1], when: isoDate(e[hit[0]]), whenIsDay: true, ...titleRef(idx, { type: 'movie', tmdbId: int(e.tmdbId), title: e.title, year: int(e.year), poster: posterIn(e.images) }) });
            } else if (win(e.airDateUtc)) {
              rows.push({ id: `e${int(e.id)}`, title: str(e.series?.title, 120) || str(e.title, 120), subtitle: `${sxe(e.seasonNumber, e.episodeNumber)}${e.title ? `, ${str(e.title, 60)}` : ''}`, when: isoDate(e.airDateUtc), ...titleRef(idx, { type: 'show', tmdbId: int(e.series?.tmdbId), tvdbId: int(e.series?.tvdbId), title: e.series?.title, year: int(e.series?.year), poster: posterIn(e.series?.images) }) });
            }
          }
        }));
        rows.sort((a, b) => Date.parse(a.when) - Date.parse(b.when));
        return { rows: rows.slice(0, 8), empty: 'Nothing scheduled in the next two weeks.' };
      },
    },
    {
      id: 'disk', title: 'Disk space', kind: 'list', requires: ['radarr', 'sonarr'], refresh: 300, order: 24, control: { span: 2 }, media: 'hidden',
      fetch: async () => {
        const seen = new Map(); // the same drive is reported by every instance that can see it
        await Promise.all(arr().map(async (svc) => {
          const list = await api(svc, '/api/v3/diskspace');
          for (const d of Array.isArray(list) ? list : []) {
            if (!d || typeof d !== 'object') continue;
            if (typeof d.totalSpace !== 'number' || d.totalSpace <= 0 || typeof d.freeSpace !== 'number') continue;
            const k = `${str(d.path, 200)}|${d.totalSpace}`;
            if (!seen.has(k)) seen.set(k, d);
          }
        }));
        const rows = [...seen.values()].map((d) => {
          const used = pct(1 - d.freeSpace / d.totalSpace);
          return { id: str(d.path, 200), title: str(d.label, 60) || str(d.path, 60), subtitle: str(d.path, 80), progress: used, right: `${fmtBytes(d.freeSpace)} free`, go: { drive: str(d.path, 200) }, ...(used > 0.9 ? { badge: { text: 'Almost full', tone: 'warn' } } : {}) };
        }).sort((a, b) => b.progress - a.progress).slice(0, 8);
        return { rows, empty: 'No drives reported.' };
      },
    },
  ],
};
